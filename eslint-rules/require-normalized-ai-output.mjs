/**
 * ESLint rule: require-normalized-ai-output  (TIM-1356 / AI-CONTENT-NORMALIZATION.md)
 *
 * Flags raw AI-generated text (from anthropic.* / openai.* / faker.*) that is
 * returned to the client without first passing through a normalize.* function
 * (normalizeAIOutput / toTitleCase / applyVoiceRules / stripEmojiFromBody /
 * stripAIJargon / titleCaseFields).
 *
 * Scope (deliberately narrow to keep false positives at zero so the gate can be
 * merge-blocking):
 *   - Direct `return <rawAiText>`.
 *   - `<rawAiText>` passed straight into Response.json / NextResponse.json /
 *     new Response(...) — at top level or one level inside an object literal.
 * Streaming deltas (`event.delta.text`, `chunk.delta.text`) are NOT flagged.
 * Normalization policy for streams (TIM-1382):
 *   - Copilot chat (/api/copilot/stream): deliberately EXEMPT. Conversational
 *     coaching dialogue — stripping jargon/emoji would degrade the coaching voice.
 *   - All other streams (business-plan/generate, business-plan/improve,
 *     copilot/improve, scorecard-feedback): NORMALIZED at the server done.text
 *     boundary via normalizeAIOutput(). Clients must prefer done.text over
 *     locally-accumulated deltas so the normalized form reaches the user.
 */

const NORMALIZE_FNS = new Set([
  "normalizeAIOutput",
  "toTitleCase",
  "applyVoiceRules",
  "stripEmojiFromBody",
  "stripAIJargon",
  "titleCaseFields",
]);

const RESPONSE_METHODS = new Set(["json", "text"]);

// Flatten a callee/member chain to a dotted string, e.g. anthropic.messages.create
function memberText(node) {
  if (!node) return "";
  if (node.type === "Identifier") return node.name;
  if (node.type === "ThisExpression") return "this";
  if (node.type === "MemberExpression") {
    const obj = memberText(node.object);
    const prop = node.computed
      ? node.property.type === "Literal"
        ? String(node.property.value)
        : "[]"
      : node.property.name;
    return obj ? `${obj}.${prop}` : prop;
  }
  if (node.type === "CallExpression") return memberText(node.callee);
  if (node.type === "ChainExpression") return memberText(node.expression);
  return "";
}

function isAICall(node) {
  if (!node || node.type !== "CallExpression") return false;
  const txt = memberText(node.callee);
  if (!txt) return false;
  return (
    /(^|\.)anthropic(\.|$)/i.test(txt) ||
    /(^|\.)openai(\.|$)/i.test(txt) ||
    /(^|\.)faker(\.|$)/i.test(txt) ||
    /messages\.(create|stream)$/.test(txt) ||
    /chat\.completions\.create$/.test(txt)
  );
}

function isFakerCall(node) {
  return node && node.type === "CallExpression" && /(^|\.)faker(\.|$)/i.test(memberText(node.callee));
}

// Remove value-preserving wrappers so we can inspect the underlying source:
//   await x, (x), x as T, x?.y chains, x.trim()/.toString(), x ?? "", `${x}`
function unwrap(node) {
  if (!node) return node;
  switch (node.type) {
    case "AwaitExpression":
    case "TSNonNullExpression":
      return unwrap(node.argument ?? node.expression);
    case "TSAsExpression":
    case "TSSatisfiesExpression":
      return unwrap(node.expression);
    case "ChainExpression":
      return unwrap(node.expression);
    case "LogicalExpression":
      if (node.operator === "??" || node.operator === "||") return unwrap(node.left);
      return node;
    case "ConditionalExpression":
      // `cond ? a.text : ""` — inspect the non-empty branch.
      return unwrap(
        node.consequent.type === "Literal" && node.consequent.value === "" ? node.alternate : node.consequent,
      );
    case "CallExpression": {
      const m = node.callee;
      if (m.type === "MemberExpression" && !m.computed) {
        const name = m.property.name;
        if (["trim", "trimStart", "trimEnd", "toString", "normalize"].includes(name)) {
          return unwrap(m.object);
        }
      }
      if (m.type === "Identifier" && m.name === "String") return unwrap(node.arguments[0]);
      return node;
    }
    case "TemplateLiteral":
      if (node.expressions.length === 1 && node.quasis.every((q) => q.value.raw === "")) {
        return unwrap(node.expressions[0]);
      }
      return node;
    default:
      return node;
  }
}

function isNormalizeCall(node) {
  if (!node || node.type !== "CallExpression") return false;
  const c = node.callee;
  if (c.type === "Identifier") return NORMALIZE_FNS.has(c.name);
  if (c.type === "MemberExpression" && !c.computed) {
    if (c.object.type === "Identifier" && c.object.name === "normalize") return true;
    return NORMALIZE_FNS.has(c.property.name);
  }
  return false;
}

export default {
  meta: {
    type: "problem",
    docs: { description: "Require AI-generated text to pass through normalize.* before being returned." },
    schema: [],
    messages: {
      unwrapped:
        "Raw AI-generated text reaches the client without normalize.*. Wrap it in normalizeAIOutput() (or the relevant sub-function) — see AI-CONTENT-NORMALIZATION.md.",
    },
  },

  create(context) {
    // Variables holding an AI message/response object.
    const aiMsgVars = new Set();
    // Variables holding a raw AI text string (e.g. const rawText = msg.content[0].text).
    const aiTextVars = new Set();

    // Is this node a read of AI text (a string), e.g. msg.content[0].text,
    // resp.text, a faker call, or an identifier we tracked as AI text.
    function isRawAIText(node) {
      const n = unwrap(node);
      if (!n) return false;
      if (isFakerCall(n)) return true;
      if (n.type === "Identifier") return aiTextVars.has(n.name);
      if (n.type === "MemberExpression") {
        const propName = n.computed ? null : n.property.name;
        if (propName === "text" || propName === "value" || propName === "output_text") {
          // base must trace back to an AI source or tracked AI message var.
          return baseIsAISource(n.object);
        }
      }
      return false;
    }

    // Does this object expression trace back to an AI call or an aiMsgVar?
    function baseIsAISource(node) {
      const n = unwrap(node);
      if (!n) return false;
      if (isAICall(n)) return true;
      if (n.type === "Identifier") return aiMsgVars.has(n.name);
      if (n.type === "MemberExpression") return baseIsAISource(n.object);
      return false;
    }

    function track(name, init) {
      if (!name || !init) return;
      const u = unwrap(init);
      if (isAICall(u)) aiMsgVars.add(name);
      else if (isRawAIText(u)) aiTextVars.add(name);
    }

    function checkEscaping(node) {
      if (!node) return;
      const u = unwrap(node);
      if (isNormalizeCall(u)) return; // wrapped — OK
      if (isRawAIText(u)) {
        context.report({ node, messageId: "unwrapped" });
        return;
      }
      // One level into an object literal: { body: rawAiText, ... }
      if (u.type === "ObjectExpression") {
        for (const prop of u.properties) {
          if (prop.type === "Property") checkEscaping(prop.value);
        }
      }
    }

    return {
      VariableDeclarator(node) {
        if (node.id.type === "Identifier") track(node.id.name, node.init);
      },
      AssignmentExpression(node) {
        if (node.left.type === "Identifier") track(node.left.name, node.right);
      },
      ReturnStatement(node) {
        if (node.argument) checkEscaping(node.argument);
      },
      CallExpression(node) {
        const txt = memberText(node.callee);
        const last = txt.split(".").pop();
        if (/(^|\.)(Response|NextResponse)\.(json|text)$/.test(txt) || (RESPONSE_METHODS.has(last) && /Response$/i.test(txt.replace(/\.[^.]+$/, "")))) {
          for (const arg of node.arguments) checkEscaping(arg);
        }
      },
      NewExpression(node) {
        if (node.callee.type === "Identifier" && node.callee.name === "Response") {
          for (const arg of node.arguments) checkEscaping(arg);
        }
      },
    };
  },
};
