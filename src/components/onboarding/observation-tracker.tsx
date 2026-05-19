"use client";

// TIM-821: Screen 3 observation activity — STEP 1.
// Collects competitive shop observations before the founder answers the
// differentiation question. STEP 2 (ScaffoldedForm) is locked until at
// least one entry exists here, or the founder triggers the skip-ahead path.

export interface ObservationEntry {
  shop_name: string;
  what_they_do_well: string;
  what_frustrates_me: string;
  the_gap: string;
}

interface ObservationTrackerProps {
  entries: ObservationEntry[];
  onEntriesChange: (entries: ObservationEntry[]) => void;
  onDefer: () => void;
}

const EMPTY_ENTRY: ObservationEntry = {
  shop_name: "",
  what_they_do_well: "",
  what_frustrates_me: "",
  the_gap: "",
};

function EntryCard({
  entry,
  index,
  onChange,
  onRemove,
}: {
  entry: ObservationEntry;
  index: number;
  onChange: (updated: ObservationEntry) => void;
  onRemove: () => void;
}) {
  const field = (
    key: keyof ObservationEntry,
    label: string,
    placeholder: string,
  ) => (
    <div>
      <label className="block text-xs text-[#6b6b6b] mb-1">{label}</label>
      <input
        type="text"
        value={entry[key]}
        onChange={(e) => onChange({ ...entry, [key]: e.target.value })}
        placeholder={placeholder}
        className="w-full border border-[#e5e3de] rounded-lg px-3 py-2 text-sm text-[#1a1a1a] placeholder-[#afafaf] focus:outline-none focus:border-[#155e63] bg-white transition-colors"
      />
    </div>
  );

  return (
    <div className="bg-white border border-[#e5e3de] rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-[#6b6b6b] uppercase tracking-wide">
          Shop {index + 1}
        </span>
        <button
          type="button"
          onClick={onRemove}
          className="text-xs text-[#afafaf] hover:text-[#a13d3d] transition-colors"
        >
          Remove
        </button>
      </div>
      {field("shop_name", "Shop name", "Blue Bottle on Mint Plaza")}
      {field(
        "what_they_do_well",
        "What they do well",
        "Fast line movement even during the morning rush.",
      )}
      {field(
        "what_frustrates_me",
        "What frustrates me as a customer",
        "No seating and nowhere to pause.",
      )}
      {field(
        "the_gap",
        "The gap I see",
        "Nobody nearby has a comfortable place to slow down and stay.",
      )}
    </div>
  );
}

export function ObservationTracker({
  entries,
  onEntriesChange,
  onDefer,
}: ObservationTrackerProps) {
  function addEntry() {
    onEntriesChange([...entries, { ...EMPTY_ENTRY }]);
  }

  function updateEntry(index: number, updated: ObservationEntry) {
    const next = entries.map((e, i) => (i === index ? updated : e));
    onEntriesChange(next);
  }

  function removeEntry(index: number) {
    onEntriesChange(entries.filter((_, i) => i !== index));
  }

  function handlePrint() {
    window.print();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[#1a1a1a]">
          STEP 1: Visit local coffee shops
        </h3>
        <button
          type="button"
          onClick={handlePrint}
          className="text-xs text-[#6b6b6b] hover:text-[#155e63] transition-colors underline"
        >
          Download printable version
        </button>
      </div>

      <p className="text-sm text-[#6b6b6b] leading-relaxed">
        For each shop, note what they do well, what frustrates you as a
        customer, and what gap you could fill.
      </p>

      {entries.length > 0 && (
        <div className="space-y-3">
          {entries.map((entry, i) => (
            <EntryCard
              key={i}
              entry={entry}
              index={i}
              onChange={(updated) => updateEntry(i, updated)}
              onRemove={() => removeEntry(i)}
            />
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={addEntry}
        className="flex items-center gap-2 text-sm text-[#155e63] hover:underline focus:outline-none"
      >
        <span className="text-lg leading-none" aria-hidden="true">+</span>
        Add a shop observation
      </button>

      <div className="pt-2">
        <button
          type="button"
          onClick={onDefer}
          className="text-sm text-[#6b6b6b] hover:text-[#155e63] hover:underline focus:outline-none transition-colors"
        >
          I will do the observation first. Remind me to come back.
        </button>
      </div>
    </div>
  );
}
