type PageHeaderProps = {
  title: string;
  description: string;
  action?: React.ReactNode;
};

export function PageHeader({ title, description, action }: PageHeaderProps) {
  return (
    <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        <h1 className="text-2xl font-semibold tracking-[-0.03em] sm:text-[1.75rem]">{title}</h1>
        <p className="mt-1.5 text-sm text-neutral-500">{description}</p>
      </div>
      {action}
    </div>
  );
}
