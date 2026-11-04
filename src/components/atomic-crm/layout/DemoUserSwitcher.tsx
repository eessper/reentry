import { useQueryClient } from "@tanstack/react-query";
import { UserRoundCog } from "lucide-react";
import {
  useAuthProvider,
  useGetIdentity,
  useGetList,
  useNavigate,
  useTranslate,
} from "ra-core";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useIsMobile } from "@/hooks/use-mobile";

import type { Sale } from "../types";

export const isDemo = import.meta.env.VITE_IS_DEMO === "true";

/**
 * Demo only: switch between the demo staff (one per role) to show what each
 * role sees. In the real app people sign in as themselves.
 */
export const DemoUserSwitcher = () => (isDemo ? <Switcher /> : null);

const Switcher = () => {
  const translate = useTranslate();
  const isMobile = useIsMobile();
  const authProvider = useAuthProvider();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { identity } = useGetIdentity();
  const { data: staff = [] } = useGetList<Sale>("sales", {
    pagination: { page: 1, perPage: 50 },
    sort: { field: "id", order: "ASC" },
  });

  const roleLabel = (role: Sale["role"]) =>
    translate(`resources.sales.roles.${role}`);

  const switchTo = async (sale: Sale) => {
    await authProvider?.login({ email: sale.email });
    // Everything on screen depends on who is looking: refetch it all
    await queryClient.invalidateQueries();
    navigate("/");
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="mr-2"
          aria-label={translate("crm.demo.switch_title")}
        >
          <UserRoundCog />
          {isMobile || !identity
            ? null
            : translate("crm.demo.viewing_as", {
                name: identity.fullName,
                role: roleLabel(identity.role),
              })}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>
          {translate("crm.demo.switch_title")}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {staff.map((sale) => (
          <DropdownMenuItem key={sale.id} onSelect={() => switchTo(sale)}>
            <span className="font-medium">
              {sale.first_name} {sale.last_name}
            </span>
            <span className="text-muted-foreground">
              {roleLabel(sale.role)}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
