import classNames = require("classnames");
import { copyToClipboard } from "lib/util";
import * as React from "react";
import Linkify from "react-linkify";
import { NotificationStatus, showNotification } from "reducers/notifications";
import Tooltip from "rc-tooltip";
import * as css from "./Notification.scss";

export enum NotificationViewStatus {
  Pending = "Pending",
  Failure = "Failure",
  Success = "Success"
}

interface IProps {
  title: string;
  status: NotificationViewStatus;
  message: string;
  fullErrorMessage?: string;
  timestamp: number;
  url?: string;
  dismiss: () => any;
  minimize: () => any;
  showNotification: typeof showNotification;
}

export default class Notification extends React.Component<IProps, null> {
  constructor(props: IProps) {
    super(props);
  }

  private handleClose = (): void => {
    const { dismiss, status } = this.props;
    if (status === NotificationViewStatus.Pending) {
      if (confirm("Often transactions get approved after 24h, closing this will prevent you from following the status of the tx, are you sure you would like to close this?")) {
        dismiss();
      }
    } else {
      dismiss();
    }
  }

  private copyToClipboard = (message: string) => (): void => {
    const { showNotification } = this.props;
    copyToClipboard(message);
    showNotification(NotificationStatus.Success, "Copied to clipboard!");
  }

  public render() {
    const { title, message, status, url, fullErrorMessage } = this.props;

    const transactionClass = classNames({
      [css.pendingTransaction]: true,
      clearfix: true,
      [css.pending]: status === NotificationViewStatus.Pending,
      [css.error]: status === NotificationViewStatus.Failure,
      [css.success]: status === NotificationViewStatus.Success,
    });

    return (
      <div className={transactionClass}>
        <div className={css.transactionBorder}></div>
        <div className={css.transactionMessage}>
          <span className={css.statusIcon}>
            <span className={css.pending}></span>
            <span className={css.success}></span>
            <span className={css.error}></span>
          </span>
          <span className={css.transactionTitle}>
            <span className={css.pending}>{title}</span>
            <span className={css.success}>{title}</span>
            <span className={css.error}>{title}</span>
          </span>
          <span className={css.notificationMessage}>
            <Linkify>{message}</Linkify>
            {
              fullErrorMessage ?
                <span style={{cursor: "pointer"}} onClick={this.copyToClipboard(fullErrorMessage)}>&nbsp;(copy full error)</span>
                : ""
            }
            {
              url ?
                <span><a href={url} target="_blank" rel="noopener noreferrer">See in etherscan</a></span>
                : ""
            }
          </span>
        </div>
        <Tooltip placement="top" trigger={["hover"]} overlay={"Dismiss"}>
          <div className={css.notificationControls}>
            { (status === NotificationViewStatus.Pending) ? 
              <button className={css.pending} onClick={this.handleClose} data-test-id="button-notification-close"><img src="/assets/images/Icon/x-grey.svg" /></button>
              : (status === NotificationViewStatus.Success) ?
                <button className={css.success} onClick={this.handleClose}  data-test-id="button-notification-close"><img src="/assets/images/Icon/x-grey.svg" /></button>
                : (status === NotificationViewStatus.Failure) ?
                  <button className={css.error} onClick={this.handleClose}  data-test-id="button-notification-close"><img src="/assets/images/Icon/x-grey.svg" /></button>
                  : ""
            }
          </div>
        </Tooltip>
      </div>
    );
  }
}
