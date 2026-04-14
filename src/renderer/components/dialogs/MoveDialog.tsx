import { CopyDialog } from './CopyDialog';

type Props = {
  sources: string[];
  dstDefault: string;
  onSubmit: (dst: string) => void;
  onCancel: () => void;
};

export function MoveDialog(p: Props) {
  return <CopyDialog {...p} ctaLabel="Move" />;
}
