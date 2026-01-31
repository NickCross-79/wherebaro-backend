import { ObjectId } from "mongodb";

export default class Item {
    constructor(
        public name: string,
        public image: string,
        public link: string,
        public creditPrice: number, 
        public ducatPrice: number,
        public type: string, 
        public offeringDates: string[],
        public likes: number,
        public reviews: string[]
    ) {}
}