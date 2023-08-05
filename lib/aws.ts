import { SendTemplatedEmailCommand } from '@aws-sdk/client-ses'
import { env } from '@/env.mjs'

export const createReminderEmailCommand = (user, templateName) => {
	return new SendTemplatedEmailCommand({
		/**
		 * Here's an example of how a template would be replaced with user data:
		 * Template: <h1>Hello {{contact.firstName}},</h1><p>Don't forget about the party gifts!</p>
		 * Destination: <h1>Hello Bilbo,</h1><p>Don't forget about the party gifts!</p>
		 */
		Destination: { ToAddresses: [user.emailAddress] },
		TemplateData: JSON.stringify({ contact: { firstName: user.firstName } }),
		Source: env.AWS_SMTP_FROM,
		Template: templateName,
	})
}
