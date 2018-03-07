/**
 * 支払取引ファクトリー
 * @namespace transaction.pay
 */

import * as MoneyTransferActionFactory from '../action/transfer/moneyTransfer';
import { IExtendId } from '../autoGenerated';
import { IClientUser } from '../clientUser';
import OrganizationType from '../organizationType';
import PersonType from '../personType';
import * as TransactionFactory from '../transaction';
import TransactionStatusType from '../transactionStatusType';
import TransactionTasksExportationStatus from '../transactionTasksExportationStatus';
import TransactionType from '../transactionType';

export interface IRecipient {
    typeOf: OrganizationType | PersonType;
    id: string;
    name: string;
    url: string;
}

export interface IAgent {
    typeOf: OrganizationType | PersonType;
    id: string;
    name: string;
    url: string;
}

export type IResult = any;

/**
 * error interface
 * エラーインターフェース
 * @export
 */
export type IError = any;

/**
 * object of a transaction interface
 * 取引対象物インターフェース
 * @export
 */
export interface IObject {
    clientUser: IClientUser;
    price: number;
    fromAccountId: string;
    toAccountId: string;
    notes: string;
}

export interface IPotentialActions {
    moneyTransfer: MoneyTransferActionFactory.IAttributes;
}

export type ITransaction = IExtendId<IAttributes>;

/**
 * place order transaction interface
 * 注文取引インターフェース
 * @export
 */
export interface IAttributes extends TransactionFactory.IAttributes<IAgent, IObject, IResult> {
    /**
     * 購入者
     */
    agent: IAgent;
    /**
     * 販売者
     */
    recipient: IRecipient;
    /**
     * 取引の結果発生するもの
     */
    result?: IResult;
    /**
     * 取引に関するエラー
     */
    error?: IError;
    /**
     * 取引の対象物
     * 座席仮予約、クレジットカードのオーソリなど、取引を構成する承認などが含まれます。
     */
    object: IObject;
    potentialActions?: IPotentialActions;
}

/**
 * create placeOrderTransaction object.
 * 注文取引オブジェクトを生成する。
 * @export
 */
export function createAttributes(params: {
    status: TransactionStatusType;
    agent: IAgent;
    recipient: IRecipient;
    result?: IResult;
    error?: IError;
    object: IObject;
    expires: Date;
    startDate?: Date;
    endDate?: Date;
    tasksExportedAt?: Date;
    tasksExportationStatus: TransactionTasksExportationStatus;
    potentialActions?: IPotentialActions;
}): IAttributes {
    return {
        ...TransactionFactory.createAttributes({
            typeOf: TransactionType.Pay,
            status: params.status,
            agent: params.agent,
            result: params.result,
            error: params.error,
            object: params.object,
            expires: params.expires,
            startDate: params.startDate,
            endDate: params.endDate,
            tasksExportedAt: params.tasksExportedAt,
            tasksExportationStatus: params.tasksExportationStatus,
            potentialActions: params.potentialActions
        }),
        ...{
            recipient: params.recipient,
            object: params.object
        }
    };
}
