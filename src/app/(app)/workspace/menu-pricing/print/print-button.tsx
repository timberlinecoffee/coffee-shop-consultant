"use client";

// TIM-4106 (UX Phase 1): re-export of the shared button so every print route
// carries the same label. Kept as a re-export rather than deleted so existing
// import sites are untouched.
export { PrintDocumentButton as PrintButton } from "@/components/workspace/PrintDocumentButton";
