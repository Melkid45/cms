type PageHeaderProps = {
  title: string;
  action?: React.ReactNode;
};

// No visible page title in the admin: the sidebar shows where you are (Vova, 2026-11-22).
// The title stays for screen readers; actions sit on the right. Screens moved to
// AdminPanel (admin-panel.tsx) put their actions into the container toolbar instead.
export function PageHeader({ title, action }: PageHeaderProps) {
  return (
    <>
      <h1 className="sr-only">{title}</h1>
      {action && <div className="mb-5 flex flex-wrap justify-end gap-2.5">{action}</div>}
    </>
  );
}
