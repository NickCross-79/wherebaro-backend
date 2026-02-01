import { ObjectId } from "mongodb";

export default class Review {
    constructor(
        public _id: ObjectId | undefined,
        public item_oid: ObjectId,
        public user: string,
        public content: string,
        public date: string,
        public time: string,
        public uid: string
    ) {}
}
