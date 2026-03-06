import { ObjectId } from "mongodb";

export default class Like {
    constructor(
        public _id: ObjectId | undefined,
        public item_oid: ObjectId,
        public uid: string
    ) {}
}
