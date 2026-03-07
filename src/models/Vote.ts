import { ObjectId } from "mongodb";

export default class Vote {
    constructor(
        public _id: ObjectId | undefined,
        public item_oid: ObjectId,
        public uid: string,
        public voteType: "buy" | "skip"
    ) {}
}
