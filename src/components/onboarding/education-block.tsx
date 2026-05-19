"use client";

// TIM-821: always-visible concept-framing card that appears above every guided question.
// Not collapsible — skip path hides sub-questions but never hides this block.

interface ExampleShop {
  name: string;
  descriptor: string;
}

interface EducationBlockProps {
  intro: string;
  examples?: ExampleShop[];
}

export function EducationBlock({ intro, examples }: EducationBlockProps) {
  return (
    <div className="bg-[#f5f3ef] border-l-4 border-[#155e63] rounded-r-xl px-5 py-4 mb-6">
      <p className="text-[#3d3d3d] text-base leading-relaxed whitespace-pre-line">
        {intro}
      </p>
      {examples && examples.length > 0 && (
        <ul className="mt-4 space-y-1.5">
          {examples.map((ex) => (
            <li key={ex.name} className="text-[#3d3d3d] text-base leading-relaxed">
              <span className="font-semibold">{ex.name}:</span>{" "}
              {ex.descriptor}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
