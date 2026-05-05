import { toast, type ExternalToast } from 'sonner';

export type NotifyOptions = ExternalToast;

export const notify = {
  success: (message: string, opts?: NotifyOptions) => toast.success(message, opts),
  error:   (message: string, opts?: NotifyOptions) => toast.error(message, opts),
  info:    (message: string, opts?: NotifyOptions) => toast.info(message, opts),
  warning: (message: string, opts?: NotifyOptions) => toast.warning(message, opts),
  loading: (message: string, opts?: NotifyOptions) => toast.loading(message, opts),
  promise: toast.promise,
  dismiss: toast.dismiss,
};
