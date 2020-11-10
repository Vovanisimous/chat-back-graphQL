const bcrypt = require("bcryptjs");
const { UserInputError, AuthenticationError } = require("apollo-server");
const jwt = require("jsonwebtoken");
const { Op } = require("sequelize");

const { Message, User } = require("../../models/index");
const { JWT_SECRET } = require("../../config/env.json");

module.exports = {
    Query: {
        getUsers: async (_, __, {user}) => {
            try {
                if (!user) throw new AuthenticationError('Unauthenticated')


                let users = await User.findAll({
                    attributes: ['username', 'imageUrl', 'createdAt'],
                    where: { username: { [Op.ne]: user.username } },
                });

                const allUserMessages = await Message.findAll({
                    where: {
                        [Op.or]: [{from: user.username}, {to: user.username}]
                    },
                    order: [['createdAt', 'DESC']]
                })

                users = users.map(otherUser => {
                    const latestMessage = allUserMessages.find(
                        message => message.from === otherUser.username || message.to === otherUser.username
                    )
                    otherUser.latestMessage = latestMessage
                    return otherUser
                })

                return users;
            } catch (err) {
                console.log(err);
                throw err;
            }
        },
        login: async (_, args) => {
            const { username, password } = args;
            let errors = {};

            try {
                if (username.trim() === "") errors.username = "Username must not be empty";
                if (password === "") errors.password = "Password must not be empty";

                if (Object.keys(errors).length > 0) {
                    throw new UserInputError("Bad input", { errors });
                }

                const user = await User.findOne({
                    where: { username },
                });

                if (!user) {
                    errors.username = "User not found";
                    throw new UserInputError("User not found", { errors });
                }

                const correctPassword = await bcrypt.compare(password, user.password);

                if (!correctPassword) {
                    errors.password = "Password is incorrect";
                    throw new UserInputError("Password is incorrect", { errors });
                }

                const token = jwt.sign(
                    {
                        username,
                    },
                    JWT_SECRET,
                    { expiresIn: "24h" },
                );

                return {
                    ...user.toJSON(),
                    token,
                };
            } catch (err) {
                throw err;
            }
        },
    },
    Mutation: {
        register: async (_, args) => {
            let { username, email, password, confirmPassword } = args;
            let errors = {};

            try {
                // Validate input data
                if (username.trim() === "") errors.username = "Username must not be empty";
                if (email.trim() === "") errors.email = "Email must not be empty";
                if (password.trim() === "") errors.password = "Password must not be empty";
                if (confirmPassword.trim() === "")
                    errors.confirmPassword = "Repeat password must not be empty";

                if (password !== confirmPassword) errors.confirmPassword = "Passwords must match";
                // Check if username / email exist
                // const userByUsername = await User.findOne({where: {username: username}})
                // const userByEmail = await User.findOne({where: {email: email}})
                //
                // if (userByUsername) errors.username = 'Username is taken'
                // if (userByEmail) errors.email = 'Email is taken'

                if (Object.keys(errors).length > 0) {
                    throw errors;
                }
                // Hash password
                password = await bcrypt.hash(password, 6);
                // Create user
                const user = await User.create({
                    username,
                    email,
                    password,
                });
                // Return user
                return user;
            } catch (err) {
                console.log(err);
                if (err.name === "SequelizeUniqueConstraintError") {
                    err.errors.forEach(
                        (e) => (errors[e.path] = `${e.path.split(".")[1]} is already taken`),
                    );
                } else if (err.name === "SequelizeValidationError") {
                    err.errors.forEach((e) => (errors[e.path] = e.message));
                }
                throw new UserInputError("Bad input", { errors });
            }
        },
    },
};