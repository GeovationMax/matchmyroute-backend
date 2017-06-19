import { getIdFromJWT } from "../../../common/auth";
import * as Database from "../../../common/database";
import { MicroserviceEndpoint } from "../../../microservices-framework/web/services/microservice-endpoint";

// /////////////////////////////////////////////////////////////
// SWAGGER: start                                             //
// KEEP THIS UP-TO-DATE WHEN MAKING ANY CHANGES TO THE METHOD //
// /////////////////////////////////////////////////////////////

// TODO:
// PATH
const operation = {
    post: {
        consumes: ["application/json"],
        description: "This endpoint sets the review score for a ride, and also marks it as completed. " +
        "It will update the experiencedUser's rating, and if this is a new review, both user's distances.",
        parameters: [
            {
                description: "The ID of the BuddyRequest being reviewed",
                in: "body",
                name: "buddyRequest",
                required: true,
                type: "integer",
            },
            {
                description: "The review score",
                enum: [1, -1],
                in: "body",
                name: "score",
                required: true,
                type: "integer",
            },
        ],
        produces: ["application/json; charset=utf-8"],
        responses: {
            200: {
                description: "Updated review",
                schema: {
                    $ref: "#/definitions/SetReviewResponse",
                },
            },
            400: {
                description: "Invalid parameters, see error message",
                schema: {
                    $ref: "#/definitions/Error",
                },
            },
            403: {
                description: "An invalid authorization token was supplied",
                schema: {
                    $ref: "#/definitions/Error",
                },
            },
            default: {
                description: "unexpected error",
                schema: {
                    $ref: "#/definitions/Error",
                },
            },
        },
        security: [
            {
                userAuth: [],
            },
        ],
        summary: "Review a BuddyRequest",
        tags: [
            "BuddyRequests",
        ],
    },
};

// DEFINITIONS

const definitions = {
    SetReviewResponse: {
        properties: {
            result: {
                description: "Did the review succeede",
                example: true,
                type: "boolean",
            },
        },
        required: ["result"],
    },
};

// ///////////////
// SWAGGER: END //
// ///////////////

export const service = (broadcast: Function, params: any): Promise<any> => {
    const buddyRequestId = params.body.buddyRequest;
    const score = params.body.score;
    if (buddyRequestId === undefined) {
        throw new Error("400:Please specify the BuddyRequest you want to review by passing an ID");
    }
    let transactionClient;
    return Database.createTransactionClient().then(newClient => {
        transactionClient = newClient;
        return getIdFromJWT(params.authorization, transactionClient);
    }).then(userId => {
        return Database.updateBuddyRequestReview(userId, buddyRequestId, score, transactionClient);
    }).then(() => {
        return Database.commitAndReleaseTransaction(transactionClient);
    }).then(() => {
        return true;
    }).catch(err => {
        const originalError = typeof err === "string" ? err : err.message;
        if (typeof transactionClient !== "undefined") {
            return Database.rollbackAndReleaseTransaction(transactionClient)
            .then(() => {
                throw new Error(originalError);
            });
        } else {
            throw new Error(originalError);
        }
    });
};

// end point definition
export const setReview = new MicroserviceEndpoint("setReview")
    .addSwaggerOperation(operation)
    .addSwaggerDefinitions(definitions)
    .addService(service);