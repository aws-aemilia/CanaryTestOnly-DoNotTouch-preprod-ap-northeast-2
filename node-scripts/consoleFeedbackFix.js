/*
 * Console feedback comes into a SIM folder
 * We want this feedback to be moved into our SIM Ticketing folder, assigned to us and tagged as "customer"
 * This script is run on anatonie@'s dev desktop every hour
 */
const SimClient = require("@amzn/sim-client");
const Odin = require('@amzn/odin');

const materialSetName = 'com.amazon.credentials.isengard.464149486631.user/issueMover';
const keys = Odin.getCredentialPair(materialSetName);
const client = new SimClient({keys});

/*
 * These are the changes we make to the ticket
 * Any additional changes can be made here
 *
 * Easiest way to determine path is to make change on website and then check the audit trail
 * Example:
 * path /extensions/tt/category
 * editAction PUT
 * data AWS
 *
 * Additional logic will be needed if action is not "PUT"
 *
 * The above translates into
 * {
 *     extensions: {
 *         tt: {
 *             category: 'AWS'
 *  }}}
 */
const updates = {
    extensions: {
        tt: {
            category: 'AWS',
            type: 'Amplify',
            item: 'Console',
            assignedGroup: 'aws-mobile-amplify',
            impact: 4
        }
    },
    assignedFolder: '28d3b7f0-ce36-4ec8-95ac-1b93b4dc42f3',
    assigneeIdentity: 'email-alias:c1b2656e-3e05-4363-aede-8706fb7a2f57',
    tags: {
        customer: {
            id: 'customer'
        }
    }
};
const updateRequest = {
    body: {
        pathEdits: []
    }
};
main = async () => {
    const result = await client.getIssues({queryString: 'status:(Open) AND containingFolder:(fb232548-dcbb-4c94-b632-da8d8d04c2a1)'}).promise();
    const getPromises = result.documents.map(async ({id: issueId}) => {
        // Example get ticket request
        // const ticket = await client.getIssue({issueId}).promise();
        try {
            await client.updateIssue({issueId, ...updateRequest}).promise();
        } catch (e) {
            console.log(e);
        }
    });
    await Promise.all(getPromises);
};
const parseKeys = (obj, key, basePath) => {
    if (typeof obj[key] === 'string' || typeof obj[key] === 'number') {
        buildPath(key, obj[key], basePath);
        return;
    }
    Object.keys(obj[key]).forEach((newKey) => parseKeys(obj[key], newKey, basePath + '/' + key));
};
const buildPath = (key, value, basePath) => {
    updateRequest.body.pathEdits.push({
        editAction: 'PUT',
        path: basePath + '/' + key,
        data: value
    });
};
Object.keys(updates).forEach((key) => parseKeys(updates, key, ''));

main();
