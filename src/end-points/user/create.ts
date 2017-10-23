// import { generateJWTFor } from "../../common/auth";
import * as CloudStorage from "../../common/cloudstorage";
import * as Database from "../../common/database";
import User from "../../common/UserDataModels";
import { MicroserviceEndpoint } from "../../microservices-framework/web/services/microservice-endpoint";
// import * as logger from "winston";

// /////////////////////////////////////////////////////////////
// SWAGGER: start                                             //
// KEEP THIS UP-TO-DATE WHEN MAKING ANY CHANGES TO THE METHOD //
// /////////////////////////////////////////////////////////////

// TODO:
// PATH
const operation = {
    put: {
        consumes: ["application/json"],
        parameters: [
            {
                description: "The new user",
                in: "body",
                name: "user",
                required: true,
                schema: {
                    $ref: "#/definitions/NewUser",
                },
            },
        ],
        produces: ["application/json; charset=utf-8"],
        responses: {
            201: {
                description: "New user was created",
                schema: {
                    $ref: "#/definitions/CreateResponse",
                },
            },
            409: {
                description: "A user already exists with this email address",
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
        summary: "Create a new user",
        tags: [
            "Users",
        ],
    },
};

// DEFINITIONS

const definitions = {
    CreateResponse: {
        description: "The new user's ID and an authorised JWT",
        properties: {
            result: {
                $ref: "#/definitions/NewUserResult",
            },
        },
        required: ["result"],
    },
    NewUser: {
        description: "A User object",
        // example: [[0, 0], [1, 1]],
        properties: {
            bio: {
                description: "The user's short biography",
                example: "Hi, I'm Joe Blogs and I've been cycling London since I was 12.",
                type: "string",
            },
            email: {
                description: "The user's email address",
                example: "joe@blogs.com",
                type: "string",
            },
            id: {
                description: "The uid of the new user",
                example: "Tzsr09123dswjgwsdfiouj1289",
                type: "string",
            },
            name: {
                description: "The user's full name",
                example: "Joe Blogs",
                type: "string",
            },
            photo: {
                description: "A profile photo for the user as data URI",
                type: "string",
            },
        },
        required: ["id", "email", "name"],
    },
    NewUserResult: {
        properties: {
            jwt: {
                properties: {
                    expires: {
                        example: 123456789,
                        type: "integer",
                    },
                    firebaseToken: {
                        example: "eyJhbGciOiJI...28ZZEY",
                        type: "string",
                    },
                    token: {
                        example: "eyJhbGciOiJI...28ZZEY",
                        type: "string",
                    },
                },
            },
            profileImage: {
                description: "The public URL of the profileImage (null if no image was provided)",
                type: "string",
            },
            user: {
                $ref: "#/definitions/User",
            },
        },
        required: ["jwt", "user"],
    },
};

// ///////////////
// SWAGGER: END //
// ///////////////

export const service = (broadcast: Function, params: any): Promise<any> => {
    console.log("will try to create user");
    const payload = params.body;
    const { id, email, name, bio, photo } = payload;

    let createdUser: User;
    let client;
    return new Promise((resolve, reject) => {
        if (typeof email === "undefined" || email.trim().length === 0) {
            reject("400:Email Required");
            return;
        } else if (typeof name === "undefined" || name.trim().length === 0) {
            reject("400:Name Required");
            return;
        }
        resolve();
    })
    .then(() => {
        return Database.createTransactionClient();
    })
    // create user
    .then(newClient => {
        console.log("transaction client created");
        client = newClient;
        let sqlParams = {id, name, email, profile_bio: bio, profile_joined: new Date().toISOString()};
        return Database.putUser(sqlParams, client);
    })
    // store profile photo for user if it exists
    .then(user => {
        console.log("user stored");
        createdUser = user;
        if (typeof photo !== "undefined") {
            return CloudStorage.storeProfileImage(payload.photo, user.id)
            .then((newProfileImgName) => {
                let profileImgUrl = process.env.STORAGE_BASE_URL + "/" +
                    process.env.STORAGE_BUCKET + "/" + newProfileImgName;
                createdUser.photo = profileImgUrl;
                return Database.updateUser(createdUser.id, {profile_photo: profileImgUrl}, client);
            }, err => {
                // If the image storage errs add a status code and re-throw
                const errMsg = typeof err === "string" ? err : err.message;
                if (errMsg.indexOf("URI does not contain") !== -1) {
                    throw new Error("400:" + errMsg);
                } else {
                    throw new Error("500:" + errMsg);
                }
            });
        } else {
            return true;
        }
    })
    .then(() => {
        console.log("image stored");
        return Database.commitAndReleaseTransaction(client);
    })
    // return information to client
    .then(tokenObject => {
        console.log("commited transaction");
        let returnValues = {
            status: 201,
            user: createdUser.asUserProfile(),
        };
        return returnValues;
    })
    // handle all errors and roll back if transaction already started
    .catch(err => {
        const originalError = typeof err === "string" ? err : err.message;
        if (typeof client !== "undefined") {
            return Database.rollbackAndReleaseTransaction(client)
            .then(() => {
                throw new Error(originalError);
            });
        } else {
            throw new Error(originalError);
        }
    });
};

// end point definition
export const createUser = new MicroserviceEndpoint("createUser")
    .addSwaggerOperation(operation)
    .addSwaggerDefinitions(definitions)
    .addService(service);
