import { useState, useCallback } from 'react'
import { convertPdfToExcel } from './api/convert'
import './App.css'

function App() {
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const [showHelp, setShowHelp] = useState(false)

  const onDrop = useCallback((e) => {
    e.preventDefault()
    setDragOver(false)
    const list = Array.from(e.dataTransfer?.files || []).filter((f) => f.type === 'application/pdf')
    if (list.length) setFiles((prev) => [...prev, ...list])
    setError(null)
  }, [])

  const onDragOver = useCallback((e) => {
    e.preventDefault()
    setDragOver(true)
  }, [])

  const onDragLeave = useCallback((e) => {
    e.preventDefault()
    setDragOver(false)
  }, [])

  const onFileInput = (e) => {
    const list = Array.from(e.target.files || []).filter((f) => f.type === 'application/pdf')
    if (list.length) setFiles((prev) => [...prev, ...list])
    setError(null)
    e.target.value = ''
  }

  const removeFile = (index) => {
    setFiles((prev) => prev.filter((_, i) => i !== index))
    setError(null)
  }

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
    setProgress(0)
    try {
      const { blob, filename } = await convertPdfToExcel(files, setProgress)
      downloadBlob(blob, filename)
    } catch (err) {
      setError(err.message || 'Erreur lors de la conversion.')
    } finally {
      setLoading(false)
      setProgress(0)
    }
  }

  return (
    <div className="app">
      <header className="header">
        <div className="header__main">
          <h1>Factures PDF → Excel</h1>
          <p className="tagline">
            Importez une ou plusieurs factures PDF et téléchargez un tableau Excel structuré.
          </p>
        </div>
        <button
          type="button"
          className="btn btn--ghost header__help"
          onClick={() => setShowHelp(true)}
          aria-label="Ouvrir l’aide"
        >
          ?
        </button>
      </header>

      <section
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
          <span className="dropzone__icon">📄</span>
          <span>Glissez vos factures PDF ici ou cliquez pour parcourir</span>
        </label>
      </section>

      {files.length > 0 && (
        <section className="files">
          <h2>Fichiers sélectionnés ({files.length})</h2>
          <ul className="files__list">
            {files.map((file, i) => (
              <li key={`${file.name}-${i}`} className="files__item">
                <span className="files__name">{file.name}</span>
                <button
                  type="button"
                  className="files__remove"
                  onClick={() => removeFile(i)}
                  aria-label="Retirer"
                >
                  ×
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
            {loading ? 'Conversion en cours…' : 'Convertir en Excel'}
          </button>

          {loading && (
            <div className="progress" role="status" aria-live="polite" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
              <div className="progress__track">
                <div className="progress__bar" style={{ width: `${progress}%` }} />
              </div>
              <p className="progress__text">{progress} % – Extraction et analyse en cours…</p>
            </div>
          )}
        </section>
      )}

      {error && (
        <div className="message message--error" role="alert">
          {error}
        </div>
      )}

      {showHelp && (
        <div
          className="overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Aide"
          onClick={() => setShowHelp(false)}
        >
          <div
            className="overlay__content"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="overlay__header">
              <h2>Aide</h2>
              <button
                type="button"
                className="overlay__close"
                onClick={() => setShowHelp(false)}
                aria-label="Fermer l’aide"
              >
                ×
              </button>
            </div>
            <div className="overlay__body">
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

      <footer className="footer">
        <p>
          Les données extraites : date facture, fournisseur, total TTC, date d’échéance, mode de
          paiement, état, montant payé (acomptes), date(s) de paiement.
        </p>
      </footer>
    </div>
  )
}

export default App
