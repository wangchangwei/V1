import { ReactNode } from "react";

export const Sidebar = ({ children }: { children: ReactNode }) => {
  return (
    <aside className="flex flex-col w-60 h-full border-r-2 border-neutral-800">
      {children}
    </aside>
  );
};

export default Sidebar;
