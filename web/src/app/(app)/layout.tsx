import AppShell from "@/components/app/AppShell";

/* the console and the explorer share one frame. a route group, so the urls do
   not change and the frame stays mounted as you move between them. */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
