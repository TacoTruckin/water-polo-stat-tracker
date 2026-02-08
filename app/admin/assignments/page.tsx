'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminAssignmentsPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/admin');
  }, [router]);

  return (
    <div className="flex w-full flex-1 items-center justify-center text-slate-500">
      Redirecting…
    </div>
  );
}
