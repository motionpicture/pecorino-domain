import * as mongoose from 'mongoose';

const safe = { j: true, w: 'majority', wtimeout: 10000 };

/**
 * 口座スキーマ
 * @ignore
 */
const schema = new mongoose.Schema(
    {
    },
    {
        collection: 'accounts',
        id: true,
        read: 'primaryPreferred',
        safe: safe,
        strict: false,
        useNestedStrict: true,
        timestamps: {
            createdAt: 'createdAt',
            updatedAt: 'updatedAt'
        },
        toJSON: { getters: true },
        toObject: { getters: true }
    }
);

// 口座番号はユニーク
schema.index(
    { accountNumber: 1 },
    {
        unique: true,
        partialFilterExpression: {
            accountNumber: { $exists: true }
        }
    }
);

schema.index(
    { typeOf: 1, status: 1, name: 1, openDate: 1 },
    {
        name: 'searchAccounts'
    }
);

export default mongoose.model('Account', schema).on(
    'index',
    // tslint:disable-next-line:no-single-line-block-comment
    /* istanbul ignore next */
    (error) => {
        if (error !== undefined) {
            console.error(error);
        }
    }
);
