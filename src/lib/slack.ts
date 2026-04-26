import { WebClient } from '@slack/web-api'

const globalForSlack = globalThis as unknown as { slack: WebClient }

export const slack =
  globalForSlack.slack ||
  new WebClient(process.env.SLACK_BOT_TOKEN)

if (process.env.NODE_ENV !== 'production') globalForSlack.slack = slack

export async function sendDM(slackUserId: string, text: string): Promise<void> {
  const { channel } = await slack.conversations.open({ users: slackUserId })
  if (!channel?.id) throw new Error('DM 채널을 열 수 없습니다')
  await slack.chat.postMessage({ channel: channel.id, text })
}
