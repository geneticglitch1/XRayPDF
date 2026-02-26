//setup google auth
//only allow google login and store the user in the database if they login for the first time

import NextAuth, { type NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { createUserOnFirstGoogleLogin } from "./serverActions";

const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;

if (!googleClientId || !googleClientSecret) {
	throw new Error(
		"Missing Google OAuth env vars. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.",
	);
}

export const authOptions: NextAuthOptions = {
	providers: [
		GoogleProvider({
			clientId: googleClientId,
			clientSecret: googleClientSecret,
		}),
	],
	callbacks: {
		async signIn({ user, account }) {
			if (account?.provider !== "google") {
				return false;
			}

			if (!user.email) {
				return false;
			}

			await createUserOnFirstGoogleLogin({
				email: user.email,
				name: user.name,
			});

			return true;
		},
	},
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
