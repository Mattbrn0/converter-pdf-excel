import { useState, useCallback, useEffect } from 'react'
import { convertPdfToExcel } from './api/convert'
import { Icon, Logo } from './icons'
import './App.css'

const FIELDS = [
  { icon: 'calendar', label: 'Date de facture' },
  { icon: 'building', label: 'Fournisseur' },
  { icon: 'euro', label: 'Total TTC' },
  { icon: 'clock', label: 'Date d’échéance' },
  { icon: 'card', label: 'Mode de paiement' },
  { icon: 'badge', label: 'État (payée / à payer)' },
  { icon: 'wallet', label: 'Montant payé (acomptes)' },
  { icon: 'calendarCheck', label: 'Date(s) de paiement' },
]

const STEPS = [
  { icon: 'upload', title: 'Importez', text: 'Déposez une ou plusieurs factures PDF.' },
  { icon: 'sparkles', title: 'Analyse IA', text: 'Les informations clés sont extraites et vérifiées.' },
  { icon: 'download', title: 'Téléchargez', text: 'Récupérez un tableau Excel prêt à l’emploi.' },
]

const formatSize = (bytes) =>
  bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} Ko` : `${(bytes / 1024 / 1024).toFixed(1)} Mo`

function App() {
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [helpClosing, setHelpClosing] = useState(false)

  const addFiles = useCallback((fileList) => {
    const all = Array.from(fileList || [])
    const pdfs = all.filter((f) => f.type === 'application/pdf')
    if (pdfs.length) setFiles((prev) => [...prev, ...pdfs])
    setError(pdfs.length < all.length ? 'Seuls les fichiers PDF sont acceptés.' : null)
    setDone(null)
  }, [])

  const onDrop = useCallback(
    (e) => {
      e.preventDefault()
      setDragOver(false)
      addFiles(e.dataTransfer?.files)
    },
    [addFiles],
  )

  const onDragOver = useCallback((e) => {
    e.preventDefault()
    setDragOver(true)
  }, [])

  const onDragLeave = useCallback((e) => {
    e.preventDefault()
    setDragOver(false)
  }, [])

  const onFileInput = (e) => {
    addFiles(e.target.files)
    e.target.value = ''
  }

  const removeFile = (index) => {
    setFiles((prev) => prev.filter((_, i) => i !== index))
    setError(null)
  }

  // Fermeture en deux temps pour laisser jouer l'animation de sortie du panneau
  const closeHelp = () => setHelpClosing(true)

  useEffect(() => {
    if (!showHelp) return
    const onKey = (e) => e.key === 'Escape' && setHelpClosing(true)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showHelp])

  const downloadBlob = (blob, filename) => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleConvert = async () => {
    if (!files.length) {
      setError('Veuillez importer au moins un fichier PDF.')
      return
    }
    setLoading(true)
    setError(null)
    setDone(null)
    setProgress(0)
    try {
      const { blob, filename } = await convertPdfToExcel(files, setProgress)
      downloadBlob(blob, filename)
      setDone({ blob, filename })
    } catch (err) {
      setError(err.message || 'Erreur lors de la conversion.')
    } finally {
      setLoading(false)
      setProgress(0)
    }
  }

  const totalSize = files.reduce((sum, f) => sum + f.size, 0)
  const stage =
    progress < 20 ? 'Lecture des PDF…' : progress < 80 ?'Analyse des factures par l’IA…' : 'Génération du fichier Excel…'

  return (
    <div className="page">
      <div className="bg" aria-hidden="true" />

      <nav className="nav">
        <a className="brand" href="/">
          <Logo />
          <span className="brand__name">
            Factures <span className="brand__arrow">→</span> Excel
          </span>
        </a>
        <button type="button" className="btn btn--ghost" onClick={() => setShowHelp(true)} aria-label="Aide">
          <Icon name="help" size={18} />
          <span>Aide</span>
        </button>
      </nav>

      <main className="main">
        <header className="hero">
          <span className="pill reveal">
            <Icon name="sparkles" size={14} />
            Extraction automatique par IA
          </span>
          <h1 className="reveal" style={{ '--d': '80ms' }}>
            Vos factures PDF, <span className="hl">converties en Excel</span> en quelques secondes
          </h1>
          <p className="hero__sub reveal" style={{ '--d': '160ms' }}>
            Importez une ou plusieurs factures et téléchargez un tableau Excel structuré, une ligne par facture.
          </p>
        </header>

        <section className="card reveal" style={{ '--d': '240ms' }}>
          <div
            className={`dropzone ${dragOver ? 'dropzone--over' : ''}`}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
          >
            <input
              type="file"
              id="file-input"
              accept=".pdf,application/pdf"
              multiple
              onChange={onFileInput}
              className="dropzone__input"
            />
            <label htmlFor="file-input" className="dropzone__label">
              <span className="dropzone__icon">
                <Icon name="upload" size={28} />
              </span>
              <span className="dropzone__title">
                {dragOver ? (
                  'Relâchez pour ajouter vos factures'
                ) : (
                  <>
                    <span className="only-pointer">Glissez vos factures PDF ici</span>
                    <span className="only-touch">Touchez pour choisir vos factures</span>
                  </>
                )}
              </span>
              <span className="dropzone__hint">
                <span className="only-pointer">
                  ou <span className="link">parcourez vos fichiers</span> ·{' '}
                </span>
                PDF uniquement
              </span>
            </label>
          </div>

          {files.length > 0 && (
            <div className="files">
              <div className="files__head">
                <h2>
                  {files.length} fichier{files.length > 1 ? 's' : ''}
                  <span className="files__meta"> · {formatSize(totalSize)}</span>
                </h2>
                <button
                  type="button"
                  className="btn btn--text"
                  onClick={() => setFiles([])}
                  disabled={loading}
                >
                  <Icon name="trash" size={16} />
                  Tout retirer
                </button>
              </div>

              <ul className="files__list">
                {files.map((file, i) => (
                  <li key={`${file.name}-${i}`} className="file" style={{ '--i': Math.min(i, 8) }}>
                    <span className="file__icon">
                      <Icon name="pdf" size={18} />
                    </span>
                    <span className="file__info">
                      <span className="file__name">{file.name}</span>
                      <span className="file__size">{formatSize(file.size)}</span>
                    </span>
                    <button
                      type="button"
                      className="file__remove"
                      onClick={() => removeFile(i)}
                      disabled={loading}
                      aria-label={`Retirer ${file.name}`}
                    >
                      <Icon name="x" size={16} />
                    </button>
                  </li>
                ))}
              </ul>

              <button
                type="button"
                className="btn btn--primary"
                onClick={handleConvert}
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Icon name="loader" size={18} className="spin" />
                    Conversion en cours…
                  </>
                ) : (
                  <>
                    <Icon name="sheet" size={18} />
                    Convertir en Excel
                    <Icon name="arrow" size={18} className="btn__arrow" />
                  </>
                )}
              </button>

              {loading && (
                <div
                  className="progress"
                  role="progressbar"
                  aria-live="polite"
                  aria-valuenow={progress}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div className="convert-anim" aria-hidden="true">
                    <span className="convert-anim__doc convert-anim__doc--pdf">
                      <Icon name="pdf" size={22} />
                    </span>
                    <span className="convert-anim__flow">
                      <i />
                      <i />
                      <i />
                    </span>
                    <span className="convert-anim__doc convert-anim__doc--xls">
                      <Icon name="sheet" size={22} />
                    </span>
                  </div>
                  <div className="progress__track">
                    <div className="progress__bar" style={{ width: `${progress}%` }} />
                  </div>
                  <p className="progress__text">
                    <span key={stage} className="progress__stage">{stage}</span>
                    <strong>{progress} %</strong>
                  </p>
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="message message--error" role="alert">
              <Icon name="alert" size={18} />
              <span>{error}</span>
            </div>
          )}

          {done && (
            <div className="success" role="status">
              <svg className="success__check" viewBox="0 0 52 52" aria-hidden="true">
                <circle cx="26" cy="26" r="24" />
                <path d="m15 27 7 7 15-16" />
              </svg>
              <div className="success__text">
                <strong>Conversion terminée</strong>
                <span>{done.filename}</span>
              </div>
              <button
                type="button"
                className="btn btn--ghost success__btn"
                onClick={() => downloadBlob(done.blob, done.filename)}
              >
                <Icon name="download" size={18} />
                Télécharger à nouveau
              </button>
            </div>
          )}
        </section>

        <section className="section">
          <h2 className="section__title">Comment ça marche</h2>
          <ol className="steps">
            {STEPS.map((s, i) => (
              <li key={s.title} className="step">
                <span className="step__icon">
                  <Icon name={s.icon} size={22} />
                </span>
                <span className="step__num">0{i + 1}</span>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="section">
          <h2 className="section__title">Données extraites pour chaque facture</h2>
          <ul className="fields">
            {FIELDS.map((f) => (
              <li key={f.label} className="field">
                <span className="field__icon">
                  <Icon name={f.icon} size={18} />
                </span>
                {f.label}
              </li>
            ))}
          </ul>
        </section>
      </main>

      <footer className="footer">
        <Logo size={22} />
        <span>Factures PDF → Excel · {new Date().getFullYear()}</span>
      </footer>

      {showHelp && (
        <div
          className={`overlay ${helpClosing ? 'overlay--closing' : ''}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="help-title"
          onClick={closeHelp}
        >
          <div
            className="drawer"
            onClick={(e) => e.stopPropagation()}
            onAnimationEnd={(e) => {
              if (helpClosing && e.target === e.currentTarget) {
                setShowHelp(false)
                setHelpClosing(false)
              }
            }}
          >
            <div className="modal__header">
              <h2 id="help-title">
                <Icon name="help" size={20} />
                Aide
              </h2>
              <button
                type="button"
                className="icon-btn"
                onClick={closeHelp}
                aria-label="Fermer l’aide"
                autoFocus
              >
                <Icon name="x" size={18} />
              </button>
            </div>
            <div className="modal__body">
              <h3>Comment utiliser l’outil&nbsp;?</h3>
              <ul>
                <li>Glissez vos factures PDF dans la zone ou cliquez pour les sélectionner.</li>
                <li>Vous pouvez ajouter plusieurs factures&nbsp;: une ligne par facture dans l’Excel.</li>
                <li>Cliquez sur <strong>Convertir en Excel</strong> et attendez la fin de la barre de progression.</li>
              </ul>

              <h3>Ce qui est extrait</h3>
              <p>
                Date facture, fournisseur, total TTC (net à payer), date d’échéance, mode de paiement, état
                (payée / à payer), montant payé (acomptes) et dates de paiement.
              </p>

              <h3>En cas de problème</h3>
              <ul>
                <li>Si la conversion échoue, réessayez avec une seule facture pour identifier laquelle pose problème.</li>
                <li>Vérifiez que les montants TTC et les acomptes sont bien lisibles sur la facture.</li>
                <li>Contactez le support avec la facture concernée pour améliorer l’outil.</li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
