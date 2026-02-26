"use client";

import { signOut, useSession } from "next-auth/react";
import Link from "next/link";
import Image from "next/image";

export default function Navbar() {
  const { data: session } = useSession();

  return (
    <header className="sticky top-0 z-50 border-b border-white/5 bg-[#0a0a0a]/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        {/* Logo */}
        <Link href="/dashboard" className="flex items-center gap-2 text-lg font-bold tracking-tight text-white">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-violet-600 text-xs font-black">
            X
          </span>
          XRayPDF
        </Link>

        {/* Right side */}
        <div className="flex items-center gap-4">
          {session?.user && (
            <>
              <div className="hidden items-center gap-2 md:flex">
                {session.user.image && (
                  <Image
                    src={session.user.image}
                    alt=""
                    width={28}
                    height={28}
                    className="h-7 w-7 rounded-full"
                  />
                )}
                <span className="text-sm text-zinc-400">
                  {session.user.name ?? session.user.email}
                </span>
              </div>
              <button
                onClick={() => signOut({ callbackUrl: "/" })}
                className="rounded-lg border border-white/10 px-4 py-1.5 text-sm font-medium text-zinc-300 transition hover:border-white/20 hover:text-white"
              >
                Sign out
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
