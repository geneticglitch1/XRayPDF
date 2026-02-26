//auth functions again teh database go here and get then gen imported to the route file to be used
"use server";

import { prisma } from "@/lib/prisma";

type UpsertGoogleUserInput = {
	email: string;
	name?: string | null;
};

export const createUserOnFirstGoogleLogin = async ({
	email,
	name,
}: UpsertGoogleUserInput) => {
	const existingUser = await prisma.user.findUnique({
		where: { email },
		select: { id: true },
	});

	if (!existingUser) {
		await prisma.user.create({
			data: {
				email,
				name: name ?? null,
			},
		});
	}
};
