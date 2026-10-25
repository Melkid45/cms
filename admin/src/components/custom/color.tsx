interface ColorProps {
  value: string;
  label: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}

export default function Color({ value, label, disabled, onChange }: ColorProps) {
  return (
    <input
      type="color"
      value={value}
      aria-label={label}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value.toUpperCase())}
      className="size-8 shrink-0 cursor-pointer px-[3.5] py-0.5 rounded-lg border border-input bg-transparent disabled:cursor-not-allowed disabled:opacity-50"
    />
  );
}
