import { AdminDashboard } from "@/components/AdminDashboard";

export const dynamic = "force-dynamic";

export default function AdminPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">หลังบ้าน — จัดการคอนเทนต์</h1>
      <AdminDashboard />
    </div>
  );
}
