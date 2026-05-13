import { auth } from '@/lib/auth'
import { listAdmins } from '@/lib/admins'
import { AddAdminForm } from '@/components/admins/add-admin-form'
import { AdminTable } from '@/components/admins/admin-table'

export default async function AdminsPage() {
  const [session, admins] = await Promise.all([auth(), listAdmins()])
  const currentEmail = session?.user?.email ?? ''

  return (
    <div className="px-4 lg:px-8 py-6 space-y-6">
      <div>
        <h1 className="font-fraunces text-2xl text-ink font-semibold">관리자</h1>
        <p className="text-stone text-sm mt-0.5">
          이 화면에 등록된 이메일만 Slack 로그인 후 접근할 수 있습니다. 환경변수
          <code className="font-mono text-xs mx-1">ADMIN_EMAILS</code>에 등록된
          관리자는 비상 복구용이며, 이 화면에서 제거할 수 없습니다.
        </p>
      </div>

      <div className="bg-paper border border-border rounded-xl p-6">
        <AddAdminForm />
      </div>

      <div className="bg-paper border border-border rounded-xl overflow-hidden">
        <AdminTable admins={admins} currentEmail={currentEmail} />
      </div>
    </div>
  )
}
