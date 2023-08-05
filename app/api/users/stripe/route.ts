import { getServerSession } from 'next-auth/next'
import { z } from 'zod'

import { proPlan } from '@/config/subscriptions'
import { authOptions } from '@/lib/auth'
import { stripe } from '@/lib/stripe'
import { getUserSubscriptionPlan } from '@/lib/subscription'
import { absoluteUrl } from '@/lib/utils'

const billingUrl = absoluteUrl('/dashboard/billing')

export async function GET(req: Request) {
	try {
		const session = await getServerSession(authOptions)
		
		if (!session?.user || !session?.user.email) {
			return new Response(null, { status: 403 })
		}
		const {user} = session
		console.log('[stripe] ', {user})
		
		const subscriptionPlan = await getUserSubscriptionPlan(session.user.id)
		
		console.log('[stripe] ',  {subscriptionPlan})
		
		// The user is on the pro plan.
		// Create a portal session to manage subscription.
		if (subscriptionPlan.isPro && subscriptionPlan.stripeCustomerId) {
			const stripeSession = await stripe.billingPortal.sessions.create({
				customer: subscriptionPlan.stripeCustomerId,
				return_url: billingUrl,
			})
			
			return new Response(JSON.stringify({ url: stripeSession.url }))
		}
		
		console.log('[stripe] ',  'creating billing')
		// The user is on the free plan.
		// Create a checkout session to upgrade.
		const stripeSession = await stripe.checkout.sessions.create({
			success_url: billingUrl,
			cancel_url: billingUrl,
			payment_method_types: [
				'alipay',
				'wechat_pay',
				// 'card'
			],
			payment_method_options: {
				wechat_pay: {
					client: 'web'
				}
			},
			mode: 'payment',
			billing_address_collection: 'auto',
			customer_email: session.user.email,
			line_items: [
				{
					price: proPlan.stripePriceId,
					quantity: 1,
				},
			],
			metadata: {
				userId: session.user.id,
			},
		})
		console.log('[stripe] ',  {stripeSession})
		
		return new Response(JSON.stringify({ url: stripeSession.url }))
	} catch (error) {
		console.log('[stripe] ', { error })
		if (error instanceof z.ZodError) {
			return new Response(JSON.stringify(error.issues), { status: 422 })
		}
		
		return new Response(null, { status: 500 })
	}
}
