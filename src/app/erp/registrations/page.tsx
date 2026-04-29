import { redirect } from "next/navigation";

export default function AdminRegistrationsPage() {
  redirect("/erp/people/users?tab=registrations");
}
