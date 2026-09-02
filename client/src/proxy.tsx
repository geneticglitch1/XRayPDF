import { withAuth } from "next-auth/middleware";

export default withAuth(
    function proxy() {},
    {
        callbacks: {
            authorized: ({ token }) => !!token,
        },
    },
);

export const config = {
    // Exclude /api/health so container healthchecks aren't redirected to login.
    matcher: ["/dashboard/:path*", "/api/((?!health).*)"],
};
