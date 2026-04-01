import { mongoose } from "mongoose";

const transactionSchema = new mongoose.Schema({
    TransactionID: { type: String },
    TID: { type: String },
    Outlet: { type: String },
    AccountNo: { type: String },
    Operator: { type: String },

    DateTime: { type: Date },
    Opening: { type: Number },
    Amount: { type: Number },
    Debit: { type: Number },
    Comm: { type: Number },
    Closing: { type: Number },

    API: { type: String },
    Status: { type: String, enm: ["SUCCESS", "FAIELD", "PENDING"] },
    AutoMationChecked: { type: Boolean, default: false },
    RefundStatus: { type: String },

    LiveID: { type: String },
    ApiRequestID: { type: String },
    RequestMode: { type: String },

    SwitchingName: { type: String },
    CircleName: { type: String },

    ROfferAmount: { type: Number },
    APICommission: { type: Number },

    Optional1: { type: String },
    Optional2: { type: String },

    APIOpCode: { type: String },
    CustomerNo: { type: String },

    RequestIP: { type: String },
    O17: { type: String },

    APIOutletID: { type: String },

    Display1: { type: String },
    Display2: { type: String },
    Display3: { type: String },
    Display4: { type: String },
    Display5: { type: String },

    Optional3: { type: String },
    Optional4: { type: String },

    ModifyDate: { type: Date }

}, {
    timestamps: true // adds createdAt & updatedAt automatically
});

export const Transaction = mongoose.model('Transaction', transactionSchema);
