const { UserInputError, AuthenticationError, ForbiddenError, withFilter } = require("apollo-server");
const { Op } = require("sequelize");

const { User, Message, Reaction } = require("../../models/index");

module.exports = {
    Query: {
        getMessages: async (parent, { from }, { user }) => {
            try {
                if (!user) throw new AuthenticationError("Unauthenticated");

                const otherUser = await User.findOne({ where: { username: from } });

                if (!otherUser) {
                    throw new UserInputError("User not found");
                }

                const usernames = [user.username, otherUser.username];

                const messages = await Message.findAll({
                    where: {
                        from: { [Op.in]: usernames },
                        to: { [Op.in]: usernames },
                    },
                    order: [["createdAt", "DESC"]],
                    include: [{model: Reaction, as: 'reactions'}]
                });

                return messages;
            } catch (err) {
                console.log(err);
                throw err;
            }
        },
    },
    Mutation: {
        sendMessage: async (parent, { to, content }, { user, pubsub }) => {
            try {
                if (!user) throw new AuthenticationError("Unauthenticated");

                const recipient = await User.findOne({ where: { username: to } });

                if (!recipient) {
                    throw new UserInputError("User not found");
                } else if (recipient.username === user.username) {
                    throw new UserInputError("You cant message yourself!");
                }

                if (content.trim() === "") {
                    throw new UserInputError("Message is empty");
                }

                const message = await Message.create({
                    from: user.username,
                    to,
                    content,
                });

                await pubsub.publish("NEW_MESSAGE", { newMessage: message });

                return message;
            } catch (err) {
                console.log(err);
                throw err;
            }
        },
        reactToMessage: async (_, {uuid, content}, {user, pubsub}) => {
            const reactions = ['❤', '😆', '😯', '😢', '😡', '👍', '👎']
            try {
                // Validate reaction content
                if(!reactions.includes(content)) {
                    throw new UserInputError("Invalid reaction")
                }

                // Get user
                const username = user ? user.username : ''
                user = await User.findOne({where: {username}})
                if (!user) throw new AuthenticationError("Unauthenticated")

                // Get message
                const message = await Message.findOne({where: {uuid}})
                if(!message) throw new UserInputError('Message not found')

                // Check if it's user's chat
                if (message.from !== user.username && message.to !== user.username) {
                    throw new ForbidenError('Unauthorized')
                }

                let reaction = await Reaction.findOne({
                    where: ({messageId: message.id, userId: user.id})
                })

                // If reaction exists - update it. Else - create it
                if (reaction) {
                    reaction.content = content
                    await reaction.save()
                }else {
                    reaction = await Reaction.create({
                        messageId: message.id,
                        userId: user.id,
                        content
                    })
                }

                await pubsub.publish('NEW_REACTION', {newReaction: reaction})

                return reaction
            } catch (err) {
                throw err
            }
        }
    },
    Subscription: {
        newMessage: {
            subscribe: withFilter(
                (_, __, { pubsub, user }) => {
                    if (!user) throw new AuthenticationError("Unauthenticated");
                    return pubsub.asyncIterator("NEW_MESSAGE");
                },
                ({ newMessage }, _, { user }) => {
                    return newMessage.from === user.username || newMessage.to === user.username;
                },
            ),
        },
        newReaction: {
            subscribe: withFilter(
                (_, __, { pubsub, user }) => {
                    if (!user) throw new AuthenticationError("Unauthenticated");
                    return pubsub.asyncIterator("NEW_REACTION");
                },
                async ({ newReaction }, _, { user }) => {
                    const message = await newReaction.getMessage()
                    return message.from === user.username || message.to === user.username;
                },
            ),
        },
    },
};
