type Props = {
  /** What has been typed so far; null when no search is running. */
  buffer: string | null;
  /** False once the buffer matches nothing in the folder. */
  matched: boolean;
};

/**
 * Total Commander's quick-search box: it appears over the file list as soon as
 * Alt+letter starts a search and stays until Escape, so the typed prefix is
 * visible rather than something the cursor's jump has to be read back from.
 */
export function QuickSearch({ buffer, matched }: Props) {
  if (buffer === null) return null;
  return (
    <div className={`gc-quicksearch${matched ? '' : ' is-nomatch'}`} role="status">
      <span className="gc-quicksearch-label">Search</span>
      <span className="gc-quicksearch-buffer">{buffer}</span>
      {!matched && <span className="gc-quicksearch-note">no match</span>}
    </div>
  );
}
