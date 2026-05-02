import { WebClient } from '@slack/web-api'

const globalForSlack = globalThis as unknown as { slack?: WebClient }

export function hasSlackBotToken(): boolean {
  const token = process.env.SLACK_BOT_TOKEN
  return !!token && token !== 'xoxb-...' && !token.includes('placeholder')
}

export function getSlackClient(): WebClient {
  if (!hasSlackBotToken()) {
    throw new Error('SLACK_BOT_TOKEN이 설정되지 않았습니다')
  }

  if (!globalForSlack.slack) {
    globalForSlack.slack = new WebClient(process.env.SLACK_BOT_TOKEN)
  }

  return globalForSlack.slack
}

export async function sendDM(slackUserId: string, text: string): Promise<void> {
  const slack = getSlackClient()
  const { channel } = await slack.conversations.open({ users: slackUserId })
  if (!channel?.id) throw new Error('DM 채널을 열 수 없습니다')
  await slack.chat.postMessage({ channel: channel.id, text })
}
