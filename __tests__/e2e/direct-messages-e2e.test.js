const given = require('../../test-helpers/steps/given')
const when = require('../../test-helpers/steps/when')
const chance = require('chance').Chance()

describe(`Given two authenticated users`, () => {
  let userA, userB

  beforeAll(async () => {
    userA = await given.an_authenticated_user()
    userB = await given.an_authenticated_user()
  })

  describe('When User A sends a DM to User B', () => {
    let conversation
    const message = chance.string({length: 16})
    beforeAll(async () => {
      conversation = await when.a_user_calls_sendDirectMessage(
        userA,
        userB.username,
        message,
      )
    })

    it("The conversation's lastMessage should be user A's message", () => {
      expect(conversation.lastMessage).toEqual(message)
    })

    it('User A should see the conversation when he calls listConversations', async () => {
      const {conversations, nextToken} =
        await when.a_user_calls_listConversations(userA, 10)

      expect(nextToken).toBeNull()
      expect(conversations).toHaveLength(1)
      expect(conversations[0]).toEqual(conversation)
    })

    it('User B should see the conversation when he calls listConversations', async () => {
      const {conversations, nextToken} =
        await when.a_user_calls_listConversations(userB, 10)

      expect(nextToken).toBeNull()
      expect(conversations).toHaveLength(1)
      expect(conversations[0]).toMatchObject({
        id: conversation.id,
        lastMessage: message,
        lastModified: conversation.lastModified,
        otherUser: {
          id: userA.username,
        },
      })
    })

    describe('When User B sends a DM to User A', () => {
      let conversation2
      const message2 = chance.string({length: 16})
      beforeAll(async () => {
        conversation2 = await when.a_user_calls_sendDirectMessage(
          userB,
          userA.username,
          message2,
        )
      })

      it("The conversation's lastMessage and lastModified should be updated", () => {
        expect(conversation2.lastMessage).toEqual(message2)
        expect(conversation2.lastModified > conversation.lastModified).toBe(
          true,
        )
      })

      it('User A should see the updated conversation when he calls listConversations', async () => {
        const {conversations, nextToken} =
          await when.a_user_calls_listConversations(userA, 10)

        expect(nextToken).toBeNull()
        expect(conversations).toHaveLength(1)
        expect(conversations[0]).toMatchObject({
          id: conversation.id,
          lastMessage: message2,
          lastModified: conversation2.lastModified,
          otherUser: {
            id: userB.username,
          },
        })
      })

      it('User B should see the updated conversation when he calls listConversations', async () => {
        const {conversations, nextToken} =
          await when.a_user_calls_listConversations(userB, 10)

        expect(nextToken).toBeNull()
        expect(conversations).toHaveLength(1)
        expect(conversations[0]).toMatchObject(conversation2)
      })
    })
  })
})
