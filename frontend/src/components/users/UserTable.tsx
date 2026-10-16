import { ManagedUser, ManageableUserRole } from '@/lib/api';
import { Fragment } from 'react';

const roleClasses: Record<ManageableUserRole, string> = {
  INTAKE: 'bg-primary-subtle text-primary border-status-vouchered-border',
  FINANCE_REVIEWER:
    'bg-accent-subtle text-secondary border-status-ready-border',
  SERVICE_LEAD: 'bg-warning-subtle text-warning border-status-exception-border',
  SYSTEM_ADMIN:
    'bg-status-sent-bg text-status-sent-fg border-status-sent-border',
};
const roleIcons: Record<ManageableUserRole, string> = {
  INTAKE: 'badge',
  FINANCE_REVIEWER: 'rate_review',
  SERVICE_LEAD: 'supervisor_account',
  SYSTEM_ADMIN: 'admin_panel_settings',
};
const userCode = (user: ManagedUser) =>
  `USR-${user.id.replaceAll('-', '').slice(0, 6).toUpperCase()}`;
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
const formattedDate = (value: string) =>
  new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium' }).format(
    new Date(value),
  );

type Props = {
  users: ManagedUser[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  loading: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  onEdit: (user: ManagedUser) => void;
  onStatus: (user: ManagedUser) => void;
  onCopy: (email: string) => void;
};

function ClientAssignments({ user }: { user: ManagedUser }) {
  const assignments = user.assigned_clients ?? [];
  if (!assignments.length)
    return <span className='text-text-disabled'>Belum ditugaskan</span>;
  const visible = assignments.slice(0, 2);
  return (
    <div
      className='flex max-w-[240px] flex-wrap items-center gap-1'
      title={assignments
        .map((client) => `${client.code} — ${client.name}`)
        .join(', ')}
    >
      {visible.map((client) => (
        <span
          key={client.id}
          className='max-w-36 truncate rounded bg-surface-muted px-2 py-1 text-[11px] font-medium text-text-secondary'
        >
          {client.name}
        </span>
      ))}
      {assignments.length > visible.length && (
        <span className='rounded bg-primary-subtle px-2 py-1 text-[11px] font-semibold text-primary'>
          +{assignments.length - visible.length}
        </span>
      )}
    </div>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-semibold ${active ? 'border-status-reviewed-border bg-success-subtle text-success' : 'border-border bg-surface-muted text-text-secondary'}`}
    >
      <span className='material-symbols-outlined mr-1 text-[18px]!'>
        {active ? 'check_circle' : 'cancel'}
      </span>
      {active ? 'Aktif' : 'Nonaktif'}
    </span>
  );
}

function RoleBadge({ role }: { role: ManageableUserRole }) {
  return (
    <span
      className={`inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-semibold ${roleClasses[role]}`}
    >
      <span className='material-symbols-outlined mr-1 text-[18px]!'>
        {roleIcons[role]}
      </span>
      {role}
    </span>
  );
}

export default function UserTable({
  users,
  total,
  page,
  pageSize,
  totalPages,
  loading,
  onPageChange,
  onPageSizeChange,
  onEdit,
  onStatus,
  onCopy,
}: Props) {
  const firstItem = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastItem = Math.min(page * pageSize, total);
  const pages = Array.from(
    { length: totalPages },
    (_, index) => index + 1,
  ).filter(
    (item) => item === 1 || item === totalPages || Math.abs(item - page) <= 1,
  );

  return (
    <div className='overflow-hidden rounded-xl border border-border bg-surface shadow-sm'>
      <div className='hidden overflow-x-auto md:block'>
        <table className='w-full border-collapse text-left'>
          <thead>
            <tr className='h-11 border-b border-border bg-surface-muted'>
              {[
                'Nama & Identitas',
                'Email Pengguna',
                'Peran',
                'Status Akses',
                'Penugasan Klien Ringkas',
                'Dibuat',
                'Aksi',
              ].map((heading) => (
                <th
                  key={heading}
                  scope='col'
                  className={`whitespace-nowrap px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-text-secondary ${heading === 'Aksi' ? 'text-right' : ''}`}
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className='divide-y divide-surface-sunken text-xs'>
            {loading
              ? Array.from({ length: 5 }).map((_, index) => (
                  <tr key={index} className='h-16 animate-pulse'>
                    <td colSpan={7} className='px-4'>
                      <div className='h-8 rounded bg-surface-muted' />
                    </td>
                  </tr>
                ))
              : users.map((user) => (
                  <tr
                    key={user.id}
                    className={`group h-16 transition-colors hover:bg-primary-subtle/30 ${user.is_active ? '' : 'opacity-70'}`}
                  >
                    <td className='px-4 py-2'>
                      <div className='flex items-center gap-3'>
                        <div className='flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-subtle font-semibold text-primary'>
                          {initials(user.name)}
                        </div>
                        <div>
                          <div className='font-semibold text-text-primary'>
                            {user.name}
                          </div>
                          <div className='mt-0.5 font-mono text-[11px] text-text-disabled'>
                            {userCode(user)}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className='px-4 py-2'>
                      <div className='flex items-center gap-1.5 text-text-secondary'>
                        <span>{user.email}</span>
                        <button
                          type='button'
                          title='Salin email'
                          onClick={() => onCopy(user.email)}
                          className='rounded p-0.5 text-text-disabled opacity-0 transition hover:text-text-primary group-hover:opacity-100 focus:opacity-100'
                        >
                          <span className='material-symbols-outlined text-[15px]'>
                            content_copy
                          </span>
                        </button>
                      </div>
                    </td>
                    <td className='px-4 py-2'>
                      <RoleBadge role={user.role} />
                    </td>
                    <td className='px-4 py-2'>
                      <StatusBadge active={user.is_active} />
                    </td>
                    <td className='px-4 py-2'>
                      <ClientAssignments user={user} />
                    </td>
                    <td className='whitespace-nowrap px-4 py-2 text-text-secondary'>
                      {formattedDate(user.created_at)}
                    </td>
                    <td className='px-4 py-2 text-right'>
                      <div className='flex justify-end gap-1'>
                        <button
                          type='button'
                          title='Edit pengguna'
                          onClick={() => onEdit(user)}
                          className='rounded-lg p-1.5 text-text-secondary transition hover:bg-surface-muted hover:text-primary'
                        >
                          <span className='material-symbols-outlined text-[19px]'>
                            edit
                          </span>
                        </button>
                        <button
                          type='button'
                          title={
                            user.is_active
                              ? 'Nonaktifkan akses'
                              : 'Aktifkan akses'
                          }
                          onClick={() => onStatus(user)}
                          className={`rounded-lg p-1.5 transition ${user.is_active ? 'text-text-secondary hover:bg-danger-subtle hover:text-danger' : 'text-success hover:bg-success-subtle'}`}
                        >
                          <span className='material-symbols-outlined text-[19px]'>
                            {user.is_active ? 'person_off' : 'person_check'}
                          </span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>

      <div className='divide-y divide-surface-sunken md:hidden'>
        {loading
          ? Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className='animate-pulse p-4'>
                <div className='h-28 rounded-lg bg-surface-muted' />
              </div>
            ))
          : users.map((user) => (
              <article
                key={user.id}
                className={`space-y-3 p-4 ${user.is_active ? '' : 'opacity-70'}`}
              >
                <div className='flex items-start justify-between gap-3'>
                  <div className='flex min-w-0 items-center gap-3'>
                    <div className='flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-subtle font-semibold text-primary'>
                      {initials(user.name)}
                    </div>
                    <div className='min-w-0'>
                      <h2 className='truncate text-sm font-semibold'>
                        {user.name}
                      </h2>
                      <p className='truncate text-xs text-text-secondary'>
                        {user.email}
                      </p>
                      <p className='mt-0.5 font-mono text-[10px] text-text-disabled'>
                        {userCode(user)}
                      </p>
                    </div>
                  </div>
                  <StatusBadge active={user.is_active} />
                </div>
                <div className='flex flex-wrap items-center justify-between gap-2 border-t border-surface-sunken pt-3'>
                  <RoleBadge role={user.role} />
                  <ClientAssignments user={user} />
                </div>
                <div className='flex items-center justify-between'>
                  <span className='text-[11px] text-text-disabled'>
                    Dibuat {formattedDate(user.created_at)}
                  </span>
                  <div className='flex gap-2'>
                    <button
                      type='button'
                      onClick={() => onEdit(user)}
                      className='flex h-9 items-center gap-1 rounded-lg border border-border px-3 text-xs font-semibold'
                    >
                      <span className='material-symbols-outlined text-[17px]'>
                        edit
                      </span>
                      Edit
                    </button>
                    <button
                      type='button'
                      onClick={() => onStatus(user)}
                      className={`flex h-9 items-center gap-1 rounded-lg px-3 text-xs font-semibold ${user.is_active ? 'bg-danger-subtle text-danger' : 'bg-success-subtle text-success'}`}
                    >
                      <span className='material-symbols-outlined text-[17px]'>
                        {user.is_active ? 'person_off' : 'person_check'}
                      </span>
                      {user.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                    </button>
                  </div>
                </div>
              </article>
            ))}
      </div>

      {!loading && users.length === 0 && (
        <div className='px-4 py-16 text-center'>
          <span className='material-symbols-outlined mb-2 block text-[42px] text-text-disabled'>
            group_off
          </span>
          <h2 className='text-base font-semibold text-text-primary'>
            Tidak ada pengguna ditemukan
          </h2>
          <p className='mt-1 text-xs text-text-secondary'>
            Coba ubah kata kunci atau filter yang digunakan.
          </p>
        </div>
      )}

      {!loading && (
        <div className='flex min-h-14 flex-col items-center justify-between gap-3 border-t border-border bg-surface px-4 py-3 text-xs text-text-secondary sm:flex-row'>
          <span>
            Menampilkan{' '}
            <strong className='text-text-primary'>
              {firstItem}-{lastItem}
            </strong>{' '}
            dari <strong className='text-text-primary'>{total}</strong> pengguna
          </span>
          <div className='flex items-center gap-4'>
            <label className='hidden items-center gap-2 sm:flex'>
              Baris:
              <select
                aria-label='Jumlah baris per halaman'
                value={pageSize}
                onChange={(event) =>
                  onPageSizeChange(Number(event.target.value))
                }
                className='h-8 rounded border border-border bg-surface-muted px-2 font-semibold text-text-primary'
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
            </label>
            <nav
              aria-label='Pagination pengguna'
              className='flex items-center gap-1'
            >
              <button
                type='button'
                aria-label='Halaman sebelumnya'
                disabled={page <= 1}
                onClick={() => onPageChange(page - 1)}
                className='rounded p-1 text-text-secondary hover:bg-surface-muted disabled:cursor-not-allowed disabled:text-text-disabled'
              >
                <span className='material-symbols-outlined text-[19px]'>
                  chevron_left
                </span>
              </button>
              {pages.map((item, index) => (
                <Fragment key={item}>
                  {index > 0 && item - pages[index - 1] > 1 && (
                    <span className='px-1 text-text-disabled'>…</span>
                  )}
                  <button
                    type='button'
                    aria-current={item === page ? 'page' : undefined}
                    onClick={() => onPageChange(item)}
                    className={`flex h-8 min-w-8 items-center justify-center rounded px-2 font-semibold ${item === page ? 'bg-primary text-white' : 'text-text-primary hover:bg-surface-muted'}`}
                  >
                    {item}
                  </button>
                </Fragment>
              ))}
              <button
                type='button'
                aria-label='Halaman berikutnya'
                disabled={page >= totalPages}
                onClick={() => onPageChange(page + 1)}
                className='rounded p-1 text-text-secondary hover:bg-surface-muted disabled:cursor-not-allowed disabled:text-text-disabled'
              >
                <span className='material-symbols-outlined text-[19px]'>
                  chevron_right
                </span>
              </button>
            </nav>
          </div>
        </div>
      )}
    </div>
  );
}
