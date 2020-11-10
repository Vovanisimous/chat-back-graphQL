const {ApolloServer} = require('apollo-server');

const {sequelize} = require('./models/index.js');


const resolvers = require('./graphql/resolvers');
const typeDefs = require('./graphql/typeDefs.ts')
const contextMiddleware = require('./util/contextMiddleware')

const server = new ApolloServer({
    typeDefs,
    resolvers,
    context: contextMiddleware,
});

server.listen().then(({url}) => {
    console.log(`🚀 Server ready at ${url}`);

    sequelize.authenticate().then(() => console.log("Database connected!")).catch(err => console.log(err))
});