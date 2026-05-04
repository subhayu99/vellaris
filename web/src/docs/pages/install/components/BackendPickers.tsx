import type { DbBackend, ImageVariant, RunMode, StorageBackend } from '../state'

export function BackendPickers({
  db,
  storage,
  image,
  runMode,
  onDb,
  onStorage,
  onImage,
}: {
  db: DbBackend
  storage: StorageBackend
  image: ImageVariant
  runMode: RunMode
  onDb: (v: DbBackend) => void
  onStorage: (v: StorageBackend) => void
  onImage: (v: ImageVariant) => void
}) {
  return (
    <div className="install-grid-3">
      <fieldset className="install-fieldset">
        <legend>Database</legend>
        {(['sqlite', 'postgres', 'mysql'] as const).map((d) => (
          <label key={d}>
            <input type="radio" name="db" checked={db === d} onChange={() => onDb(d)} />
            {d === 'mysql' ? 'MySQL / MariaDB' : d.charAt(0).toUpperCase() + d.slice(1)}
          </label>
        ))}
      </fieldset>
      <fieldset className="install-fieldset">
        <legend>Storage</legend>
        {(['local', 's3', 'gcs', 'azure'] as const).map((s) => (
          <label key={s}>
            <input
              type="radio"
              name="storage"
              checked={storage === s}
              onChange={() => onStorage(s)}
            />
            {s === 'local'
              ? 'Local FS'
              : s === 's3'
                ? 'S3 / R2 / MinIO'
                : s === 'gcs'
                  ? 'Google Cloud Storage'
                  : 'Azure Blob'}
          </label>
        ))}
      </fieldset>
      {runMode !== 'pip' && (
        <fieldset className="install-fieldset">
          <legend>Image flavor</legend>
          {(['slim', 'full', 'custom'] as const).map((i) => (
            <label key={i}>
              <input type="radio" name="image" checked={image === i} onChange={() => onImage(i)} />
              {i === 'slim'
                ? 'Slim (~120 MB)'
                : i === 'full'
                  ? 'Full (~350 MB)'
                  : 'Custom Dockerfile'}
            </label>
          ))}
        </fieldset>
      )}
    </div>
  )
}
