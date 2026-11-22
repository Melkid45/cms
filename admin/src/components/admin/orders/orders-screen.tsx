"use client";
import { useEffect, useState } from "react";
import { useAccess } from "@/components/admin/access-context";
import { AdminPanel, PanelTabs } from "@/components/admin/admin-panel";
import { OrdersList } from "./orders-list";
import { RequestsAdmin } from "./requests-admin";
import { api, type TeamAccount } from "./shared";

// Designer accounts (owner only: the accounts API is owner-only).
export function useDesigners() {
  const { isOwner } = useAccess();
  const [designers, setDesigners] = useState<TeamAccount[]>([]);
  useEffect(() => {
    if (!isOwner) return;
    let active = true;
    api<TeamAccount[]>("/api/builder/accounts")
      .then(
        (data) =>
          active &&
          setDesigners(
            data.filter((a) => a.role === "designer" && !a.disabled),
          ),
      )
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [isOwner]);
  return designers;
}

export function OrdersScreen({ tab }: { tab: "orders" | "requests" }) {
  const designers = useDesigners();
  const tabs = (
    <PanelTabs
      active={tab}
      tabs={[
        ["orders", "Orders", "/dashboard/orders"],
        ["requests", "Change requests", "/dashboard/orders?tab=requests"],
      ]}
    />
  );
  return (
    <AdminPanel title={tab === "orders" ? "Orders" : "Change requests"}>
      {tab === "orders" ? (
        <OrdersList designers={designers} lead={tabs} />
      ) : (
        <RequestsAdmin designers={designers} lead={tabs} />
      )}
    </AdminPanel>
  );
}
