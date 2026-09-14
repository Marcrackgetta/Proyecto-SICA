"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  LayoutDashboard,
  Users,
  Video,
  LogOut,
  Activity,
  Grid,
  Shield
} from "lucide-react";
import Link from "next/link";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);
  const [adminName, setAdminName] = useState("");

  useEffect(() => {
    checkUser();
  }, []);

  const checkUser = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push("/");
        return;
      }

      // Check role
      const { data: userData, error } = await supabase
        .from("usuarios")
        .select("rol")
        .eq("id", session.user.id)
        .single();

      if (error || !userData || userData.rol !== "admin") {
        console.error("Acceso denegado: No es administrador", error);
        await supabase.auth.signOut();
        router.push("/");
        return;
      }

      setAdminName(session.user.email?.split("@")[0] || "Admin");
      setLoading(false);
    } catch (err) {
      console.error(err);
      router.push("/");
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  const navItems = [
    { name: "Monitoreo en Vivo", href: "/dashboard", icon: Activity },
    { name: "Grid Multi-Cámara", href: "/dashboard/grid", icon: Grid },
    { name: "Estudiantes", href: "/dashboard/estudiantes", icon: Users },
    { name: "Zonas y Cámaras", href: "/dashboard/camaras", icon: Video },
    { name: "Accesos", href: "/dashboard/accesos", icon: Shield },
  ];

  return (
    <div className="min-h-screen bg-slate-900 text-slate-200 flex flex-col font-sans">
      {/* Top Navbar */}
      <header className="bg-slate-800 border-b border-slate-700 sticky top-0 z-50 shadow-sm">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-[72px]">
            
            {/* Logo & Brand */}
            <div className="flex items-center space-x-3 pr-6">
              <div className="bg-blue-600 p-2 rounded-xl shadow-md">
                <LayoutDashboard className="text-white w-5 h-5" />
              </div>
              <span className="text-2xl font-black text-white tracking-tight">
                Edge<span className="text-blue-400">Vision</span>
              </span>
            </div>

            {/* Desktop Navigation */}
            <nav className="hidden lg:flex flex-1 items-center space-x-2 pl-6 border-l border-slate-700">
              {navItems.map((item) => {
                const isActive = pathname === item.href;
                const Icon = item.icon;
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={`flex items-center space-x-2 px-4 py-2.5 rounded-lg transition-all duration-200 text-sm font-semibold ${
                      isActive
                        ? "bg-blue-600/15 text-blue-400 border border-blue-500/20 shadow-inner"
                        : "text-slate-400 hover:bg-slate-700/50 hover:text-slate-200 border border-transparent"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.name}</span>
                  </Link>
                );
              })}
            </nav>

            {/* User & Logout */}
            <div className="flex items-center space-x-5 ml-auto">
              <div className="hidden md:flex items-center space-x-3 bg-slate-900/60 px-4 py-2 rounded-xl border border-slate-700 shadow-inner">
                 <div className="text-sm truncate font-medium text-slate-300 max-w-[120px]">{adminName}</div>
                 <div className="text-xs text-blue-400 bg-blue-400/10 px-2 py-0.5 rounded font-bold border border-blue-400/20 uppercase tracking-widest">Admin</div>
              </div>
              <button
                onClick={handleLogout}
                className="flex items-center justify-center space-x-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors px-4 py-2.5 rounded-lg font-medium"
                title="Cerrar Sesión"
              >
                <LogOut className="w-5 h-5" />
                <span className="hidden sm:inline">Salir</span>
              </button>
            </div>
          </div>
          
          {/* Mobile Navigation (Scrollable horizontally) */}
          <nav className="lg:hidden flex overflow-x-auto py-3 space-x-2 no-scrollbar border-t border-slate-700/50 -mx-4 px-4 sm:-mx-6 sm:px-6">
             {navItems.map((item) => {
                const isActive = pathname === item.href;
                const Icon = item.icon;
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors text-sm font-semibold whitespace-nowrap flex-shrink-0 ${
                      isActive
                        ? "bg-blue-600/15 text-blue-400 border border-blue-500/20"
                        : "text-slate-400 hover:bg-slate-700/50 hover:text-slate-200 border border-transparent"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.name}</span>
                  </Link>
                );
              })}
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-[1600px] mx-auto p-4 sm:p-6 lg:p-10">
        {children}
      </main>
    </div>
  );
}
