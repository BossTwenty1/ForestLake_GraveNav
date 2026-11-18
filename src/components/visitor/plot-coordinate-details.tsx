import type { PlotCoordinateReference } from "@/lib/phase2-plot-coordinates";
import styles from "./plot-coordinate-details.module.css";

export function PlotCoordinateDetails({ reference }: { reference: PlotCoordinateReference }) {
  return <details className={styles.coordinates} data-coordinate-status="cad-reference-only">
    <summary>Plot coordinates</summary>
    <p>Centre of the selected CAD outline. These drawing coordinates are not a verified GPS location or walking destination.</p>
    <table aria-label="CAD plot centre coordinates"><tbody>
      <tr><th scope="row">LPCS X</th><td>{reference.lpcsCenter[0].toFixed(3)}</td></tr>
      <tr><th scope="row">LPCS Y</th><td>{reference.lpcsCenter[1].toFixed(3)}</td></tr>
      <tr><th scope="row">Grid easting</th><td>{reference.gridCenter[0].toFixed(3)}</td></tr>
      <tr><th scope="row">Grid northing</th><td>{reference.gridCenter[1].toFixed(3)}</td></tr>
    </tbody></table>
    <p>Source datum unresolved. GPS navigation remains unavailable for this CAD candidate.</p>
  </details>;
}
