import * as createDebug from 'debug';
import { Connection } from 'mongoose';

import AccountModel from './mongoose/model/account';

import * as factory from '../factory';

const debug = createDebug('pecorino-domain:repository:account');

/**
 * 口座リポジトリー
 */
export class MongoRepository {
    public readonly accountModel: typeof AccountModel;

    constructor(connection: Connection) {
        this.accountModel = connection.model(AccountModel.modelName);
    }

    /**
     * 口座を開設する
     * @param params 口座開設初期設定
     */
    public async open(params: {
        /**
         * 口座名義
         */
        name: string;
        /**
         * 口座番号
         */
        accountNumber: string;
        /**
         * 初期金額
         */
        initialBalance: number;
        /**
         * 開設日時
         */
        openDate: Date;
    }): Promise<factory.account.IAccount> {
        debug('opening account...');
        const account: factory.account.IAccount = {
            typeOf: factory.account.AccountType.Account,
            accountNumber: params.accountNumber,
            name: params.name,
            balance: params.initialBalance,
            availableBalance: params.initialBalance,
            pendingTransactions: [],
            openDate: params.openDate,
            status: factory.accountStatusType.Opened
        };

        const doc = await this.accountModel.create(account);

        return doc.toObject();
    }

    /**
     * 口座を解約する
     * @param params.accountNumber 口座番号
     * @param params.closeDate 解約日時
     */
    public async close(params: {
        accountNumber: string;
        closeDate: Date;
    }) {
        debug('closing account...');
        const doc = await this.accountModel.findOneAndUpdate(
            {
                accountNumber: params.accountNumber,
                pendingTransactions: { $size: 0 },
                status: factory.accountStatusType.Opened
            },
            {
                closeDate: params.closeDate,
                status: factory.accountStatusType.Closed
            },
            {
                new: true
            }
        ).exec();

        // NotFoundであれば口座状態確認
        if (doc === null) {
            const account = await this.findByAccountNumber(params.accountNumber);
            if (account.status === factory.accountStatusType.Closed) {
                // すでに口座解約済の場合
                return;
            } else if (account.pendingTransactions.length > 0) {
                // 進行中取引が存在する場合の場合
                throw new factory.errors.Argument('accountNumber', 'Pending transactions exist');
            } else {
                throw new factory.errors.NotFound('Account');
            }
        }
    }

    /**
     * 口座番号で検索する
     * @param accountNumber 口座番号
     */
    public async findByAccountNumber(accountNumber: string): Promise<factory.account.IAccount> {
        const doc = await this.accountModel.findOne({ accountNumber: accountNumber }).exec();
        if (doc === null) {
            throw new factory.errors.NotFound('Account');
        }

        return doc.toObject();
    }

    /**
     * 金額を確保する
     * @param params.accountNumber 口座番号
     * @param params.amount 金額
     * @param params.transaction 進行取引
     * @see https://en.wikipedia.org/wiki/Authorization_hold
     */
    public async authorizeAmount(params: {
        accountNumber: string;
        amount: number;
        transaction: factory.account.IPendingTransaction;
    }) {
        const doc = await this.accountModel.findOneAndUpdate(
            {
                accountNumber: params.accountNumber,
                availableBalance: { $gte: params.amount }, // 利用可能金額確認
                status: factory.accountStatusType.Opened // 開いている口座
            },
            {
                $inc: { availableBalance: -params.amount }, // 残高を減らす
                $push: { pendingTransactions: params.transaction } // 進行中取引追加
            },
            { new: true }
        ).exec();

        // NotFoundであれば口座状態確認
        if (doc === null) {
            const account = await this.findByAccountNumber(params.accountNumber);
            if (account.status === factory.accountStatusType.Closed) {
                // 口座解約済の場合
                throw new factory.errors.Argument('accountNumber', 'Account already closed');
            } else if (account.availableBalance < params.amount) {
                // 残高不足の場合
                throw new factory.errors.Argument('accountNumber', 'Insufficient balance');
            } else {
                throw new factory.errors.NotFound('Account');
            }
        }
    }

    /**
     * 取引を開始する
     * @param params.accountNumber 口座番号
     * @param params.transaction 進行取引
     */
    public async startTransaction(params: {
        accountNumber: string;
        transaction: factory.account.IPendingTransaction;
    }) {
        const doc = await this.accountModel.findOneAndUpdate(
            {
                accountNumber: params.accountNumber,
                status: factory.accountStatusType.Opened // 開いている口座
            },
            { $push: { pendingTransactions: params.transaction } }
        ).exec();

        // NotFoundであれば口座状態確認
        if (doc === null) {
            const account = await this.findByAccountNumber(params.accountNumber);
            if (account.status === factory.accountStatusType.Closed) {
                // 口座解約済の場合
                throw new factory.errors.Argument('accountNumber', 'Account already closed');
            } else {
                throw new factory.errors.NotFound('Account');
            }
        }
    }

    /**
     * 決済処理を実行する
     * 口座上で進行中の取引について、実際に金額移動処理を実行します。
     */
    public async settleTransaction(params: {
        fromAccountNumber?: string;
        toAccountNumber?: string;
        amount: number;
        transactionId: string;
    }) {
        // 転送元があれば残高調整
        if (params.fromAccountNumber !== undefined) {
            await this.accountModel.findOneAndUpdate(
                {
                    accountNumber: params.fromAccountNumber,
                    'pendingTransactions.id': params.transactionId
                },
                {
                    $inc: {
                        balance: -params.amount // 残高調整
                    },
                    $pull: { pendingTransactions: { id: params.transactionId } }
                }
            ).exec();
        }

        // 転送先へがあれば入金
        if (params.toAccountNumber !== undefined) {
            await this.accountModel.findOneAndUpdate(
                {
                    accountNumber: params.toAccountNumber,
                    'pendingTransactions.id': params.transactionId
                },
                {
                    $inc: {
                        balance: params.amount,
                        availableBalance: params.amount
                    },
                    $pull: { pendingTransactions: { id: params.transactionId } }
                }
            ).exec();
        }
    }

    /**
     * 取引を取り消す
     * 口座上で進行中の取引を中止します。
     * @see https://www.investopedia.com/terms/v/void-transaction.asp
     */
    public async voidTransaction(params: {
        fromAccountNumber?: string;
        toAccountNumber?: string;
        amount: number;
        transactionId: string;
    }) {
        // 転送元があればhold解除
        if (params.fromAccountNumber !== undefined) {
            await this.accountModel.findOneAndUpdate(
                {
                    accountNumber: params.fromAccountNumber,
                    'pendingTransactions.id': params.transactionId
                },
                {
                    $inc: {
                        availableBalance: params.amount // 残高調整
                    },
                    $pull: { pendingTransactions: { id: params.transactionId } }
                }
            ).exec();
        }

        // 転送先へがあれば進行中取引削除
        if (params.toAccountNumber !== undefined) {
            await this.accountModel.findOneAndUpdate(
                {
                    accountNumber: params.toAccountNumber,
                    'pendingTransactions.id': params.transactionId
                },
                {
                    $pull: { pendingTransactions: { id: params.transactionId } }
                }
            ).exec();
        }
    }

    /**
     * 口座を検索する
     * @param searchConditions 検索条件
     */
    public async search(searchConditions: {
        accountNumbers: string[];
        statuses: factory.accountStatusType[];
        /**
         * 口座名義
         */
        name?: string;
        limit: number;
    }): Promise<factory.account.IAccount[]> {
        const andConditions: any[] = [
            { typeOf: factory.account.AccountType.Account }
        ];

        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (Array.isArray(searchConditions.accountNumbers) && searchConditions.accountNumbers.length > 0) {
            andConditions.push({
                accountNumber: { $in: searchConditions.accountNumbers }
            });
        }

        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (Array.isArray(searchConditions.statuses) && searchConditions.statuses.length > 0) {
            andConditions.push({
                status: { $in: searchConditions.statuses }
            });
        }

        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (typeof searchConditions.name === 'string') {
            andConditions.push({
                name: new RegExp(searchConditions.name, 'gi')
            });
        }

        debug('finding accounts...', andConditions);

        return this.accountModel.find(
            { $and: andConditions },
            {
                __v: 0,
                createdAt: 0,
                updatedAt: 0,
                pendingTransactions: 0
            }
        )
            .sort({ accountNumber: 1 })
            .limit(searchConditions.limit)
            .exec()
            .then((docs) => docs.map((doc) => doc.toObject()));
    }
}
