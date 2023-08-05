import { PrismaAdapter } from '@next-auth/prisma-adapter'
import { NextAuthOptions } from 'next-auth'
import EmailProvider from 'next-auth/providers/email'
import GitHubProvider from 'next-auth/providers/github'
import { Client } from 'postmark'

import { env } from '@/env.mjs'
import { siteConfig } from '@/config/site'
import { db } from '@/lib/db'
import { SendEmailCommand, SESClient } from '@aws-sdk/client-ses'
import * as fs from 'fs'
import path from 'path'
import Mustache from 'mustache'
import dayjs from 'dayjs'


export type EmailProvider = 'aws' | 'postmark'
const emailProvider: EmailProvider = 'aws'
// @ts-ignore
const isAws = emailProvider === 'aws'

const postmarkClient = new Client(env.POSTMARK_API_TOKEN)
export const AWS_REGION = 'ap-southeast-1'
const sesClient = new SESClient({ region: AWS_REGION })

const t = fs.readFileSync(path.resolve('./public', 'email.templates/welcome.html'), { encoding: 'utf-8' })


export const authOptions: NextAuthOptions = {
	// huh any! I know.
	// This is a temporary fix for prisma client.
	// @see https://github.com/prisma/prisma/issues/16117
	adapter: PrismaAdapter(db as any),
	session: {
		strategy: 'jwt',
	},
	pages: {
		signIn: '/login',
	},
	providers: [
		GitHubProvider({
			clientId: env.GITHUB_CLIENT_ID,
			clientSecret: env.GITHUB_CLIENT_SECRET,
		}),
		EmailProvider({
			server: isAws ? env.AWS_SMTP_SERVER : '',
			from: isAws ? env.AWS_SMTP_FROM : env.POSTMARK_SMTP_FROM,
			sendVerificationRequest: async ({ identifier, url, provider, token }) => {
				
				const user = await db.user.findUnique({
					where: {
						email: identifier,
					},
					select: {
						emailVerified: true,
					},
				})
				
				let result
				
				if (isAws) {
					result = await sesClient.send(new SendEmailCommand({
						Destination: { /* required */
							CcAddresses: [
								// 'EMAIL_ADDRESS',
								/* more items */
							],
							ToAddresses: [
								identifier,
								/* more items */
							],
						},
						Message: { /* required */
							Body: { /* required */
								Html: {
									Charset: 'UTF-8',
									Data: Mustache.render(t, {
										CompanyName: 'CS Magic, Inc.',
										ProductName: 'LUMOS',
										username: identifier,
										action_url: url,
										login_url: 'https://lumos.cs-magic.com/login',
										trial_length: ' 7 Days',
										trial_start_date: dayjs(new Date()).toDate().toLocaleDateString(),
										trial_end_date: dayjs(new Date()).add(7, 'days').toDate().toLocaleDateString(),
										support_mail: 'support@cs-maigc.com',
									}),
								},
								Text: {
									Charset: 'UTF-8',
									Data: 'TEXT_FORMAT_BODY',
								},
							},
							Subject: {
								Charset: 'UTF-8',
								Data: 'Welcome to CS Magic !',
							},
						},
						Source: env.AWS_SMTP_FROM, /* required */
						ReplyToAddresses: [
							env.AWS_SMTP_FROM,
							/* more items */
						],
					}))
				} else {
					const templateId = user?.emailVerified
						? env.POSTMARK_SIGN_IN_TEMPLATE
						: env.POSTMARK_ACTIVATION_TEMPLATE
					if (!templateId) {
						throw new Error('Missing template id')
					}
					
					result = await postmarkClient.sendEmailWithTemplate({
						TemplateId: parseInt(templateId),
						To: identifier,
						From: provider.from as string,
						TemplateModel: {
							action_url: url,
							product_name: siteConfig.name,
						},
						Headers: [
							{
								// Set this to prevent Gmail from threading emails.
								// See https://stackoverflow.com/questions/23434110/force-emails-not-to-be-grouped-into-conversations/25435722.
								Name: 'X-Entity-Ref-ID',
								Value: new Date().getTime() + '',
							},
						],
					})
				}
				
				console.log({ result })
				if (result.ErrorCode) {
					throw new Error(result.Message)
				}
			},
		}),
	],
	callbacks: {
		async session({ token, session }) {
			if (token) {
				session.user.id = token.id
				session.user.name = token.name
				session.user.email = token.email
				session.user.image = token.picture
			}
			
			return session
		},
		async jwt({ token, user }) {
			const dbUser = await db.user.findFirst({
				where: {
					email: token.email,
				},
			})
			
			if (!dbUser) {
				if (user) {
					token.id = user?.id
				}
				return token
			}
			
			return {
				id: dbUser.id,
				name: dbUser.name,
				email: dbUser.email,
				picture: dbUser.image,
			}
		},
	},
}
