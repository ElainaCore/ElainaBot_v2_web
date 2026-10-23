import { test, expect } from '@playwright/test'

for (const width of [1440, 375]) {
  test(`消息操作栏跟随所属气泡并引用对应消息 (${width})`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname
      let data = { success: true, data: {} }
      if (path === '/api/bots') data.bots = []
      if (path === '/api/web-pages') data.pages = []
      if (path === '/api/message/chats') data.data = {
        chats: [{ chat_id: 'group1', group_name: '引用测试群', appid: 'bot1' }], total: 1, page: 1
      }
      if (path === '/api/message/history') data.data = {
        messages: [
          { id: 1, message_id: 'incoming1', user_id: 'user1', appid: 'bot1', nickname: '对方', content: '对方的消息内容', timestamp: '2026-10-23 15:01:00', is_self: false },
          { id: 2, message_id: 'outgoing1', user_id: '', appid: 'bot1', nickname: '机器人', content: '自己的消息内容', timestamp: '2026-10-23 15:02:00', is_self: true }
        ], has_more: false
      }
      await route.fulfill({ json: data })
    })
    await page.goto('/web/messages')
    await page.locator('.chat-items article').first().click()
    const rows = page.locator('.message-row')
    await expect(rows).toHaveCount(2)
    for (let i = 0; i < 2; i++) {
      const row = rows.nth(i)
      await row.hover()
      const bubble = await row.locator('.message-bubble').boundingBox()
      const tools = await row.locator('.message-actions').boundingBox()
      const bounds = await row.boundingBox()
      expect(tools.y).toBeGreaterThanOrEqual(bubble.y + bubble.height)
      expect(tools.y + tools.height).toBeLessThanOrEqual(bounds.y + bounds.height + 1)
      if (i === 0) expect(Math.abs(tools.x - bubble.x)).toBeLessThanOrEqual(1)
      else expect(Math.abs(tools.x + tools.width - bubble.x - bubble.width)).toBeLessThanOrEqual(1)
      await row.getByRole('button', { name: '引用这条消息' }).click()
      await expect(page.locator('.quote-preview')).toContainText(i === 0 ? '对方的消息内容' : '自己的消息内容')
    }
  })
}

test('群用户头像进入私聊，用户群号进入群聊天', async ({ page }) => {
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname
    let data = { success: true, data: {} }
    if (path === '/api/bots') data.bots = []
    if (path === '/api/web-pages') data.pages = []
    if (path === '/api/message/chats') data.data = {
      chats: [{ chat_id: 'group1', group_name: '成员测试群', appid: 'bot1' }], total: 1, page: 1
    }
    if (path === '/api/message/history') data.data = { messages: [], has_more: false }
    if (path === '/api/message/group-members') data.data = {
      members: [{ user_id: 'abc123456xyz', appid: 'bot1' }]
    }
    if (path === '/api/message/user-groups') data.data = {
      groups: [{ chat_id: 'group2', group_name: '目标群聊', appid: 'bot1' }]
    }
    await route.fulfill({ json: data })
  })
  await page.goto('/web/messages')
  await page.locator('.chat-items article').first().click()
  await page.getByRole('button', { name: '会话详情', exact: true }).click()
  await page.getByRole('button', { name: '查看该群用户', exact: true }).click()
  const member = page.getByRole('button', { name: '与 abc**xyz 私聊' })
  await expect(member).toContainText('abc**xyz')
  await expect(member).not.toContainText('abc123456xyz')
  await member.click()
  await expect(page.locator('.conversation-heading h2')).toContainText('abc123456xyz')
  await page.getByRole('button', { name: '会话详情', exact: true }).click()
  await page.getByRole('button', { name: '查看该用户所在群聊' }).click()
  await page.getByRole('button', { name: '目标群聊 · group2' }).click()
  await expect(page.locator('.conversation-heading h2')).toContainText('目标群聊')
})

