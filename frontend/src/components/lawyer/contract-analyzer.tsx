'use client'

import { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { useAnalyzeContract, useAnalyzeContractText, type LawyerLanguage, type ContractAnalysis, type RiskLevel } from '@/hooks/api/use-lawyer'
import { Search, Upload, Loader2, AlertTriangle, AlertCircle, Info, CheckCircle, FileText, Type } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDropzone } from 'react-dropzone'

interface ContractAnalyzerProps {
  language: LawyerLanguage
}

const riskColors: Record<RiskLevel, { bg: string; text: string; icon: React.ComponentType<any> }> = {
  critical: { bg: 'bg-red-500/10', text: 'text-red-500', icon: AlertCircle },
  high: { bg: 'bg-orange-500/10', text: 'text-orange-500', icon: AlertTriangle },
  medium: { bg: 'bg-yellow-500/10', text: 'text-yellow-500', icon: Info },
  low: { bg: 'bg-green-500/10', text: 'text-green-500', icon: CheckCircle },
}

const riskLabels: Record<RiskLevel, string> = {
  critical: '\u041a\u0440\u0438\u0442\u0438\u0447\u0435\u0441\u043a\u0438\u0439',
  high: '\u0412\u044b\u0441\u043e\u043a\u0438\u0439',
  medium: '\u0421\u0440\u0435\u0434\u043d\u0438\u0439',
  low: '\u041d\u0438\u0437\u043a\u0438\u0439',
}

export function ContractAnalyzer({ language }: ContractAnalyzerProps) {
  const [file, setFile] = useState<File | null>(null)
  const [contractText, setContractText] = useState('')
  const [analysis, setAnalysis] = useState<ContractAnalysis | null>(null)
  const [inputMode, setInputMode] = useState<'file' | 'text'>('file')

  const { mutate: analyzeFile, isPending: isFilePending } = useAnalyzeContract()
  const { mutate: analyzeText, isPending: isTextPending } = useAnalyzeContractText()

  const isPending = isFilePending || isTextPending

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setFile(acceptedFiles[0])
      setAnalysis(null)
    }
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'text/plain': ['.txt'],
    },
    maxSize: 10 * 1024 * 1024,
    multiple: false,
  })

  const handleAnalyze = () => {
    if (inputMode === 'file') {
      if (!file) return
      analyzeFile({ file, language }, {
        onSuccess: (data) => setAnalysis(data),
      })
    } else {
      if (!contractText.trim() || contractText.trim().length < 100) return
      analyzeText({ text: contractText, language }, {
        onSuccess: (data) => setAnalysis(data),
      })
    }
  }

  const handleReset = () => {
    setAnalysis(null)
    setFile(null)
    setContractText('')
  }

  const getRiskStats = () => {
    if (!analysis) return { critical: 0, high: 0, medium: 0, low: 0 }
    return analysis.risks.reduce((acc, risk) => {
      acc[risk.level] = (acc[risk.level] || 0) + 1
      return acc
    }, { critical: 0, high: 0, medium: 0, low: 0 } as Record<RiskLevel, number>)
  }

  const riskStats = getRiskStats()

  const canAnalyze = inputMode === 'file'
    ? !!file && !isPending
    : contractText.trim().length >= 100 && !isPending

  return (
    <div className="p-6 space-y-6 overflow-auto">
      <div className="max-w-3xl mx-auto">
        {/* Input Area */}
        {!analysis && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Search className="h-5 w-5" />
                {'\u0410\u043d\u0430\u043b\u0438\u0437 \u0434\u043e\u0433\u043e\u0432\u043e\u0440\u0430'}
              </CardTitle>
              <CardDescription>
                {'\u0417\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u0435 \u0444\u0430\u0439\u043b \u0438\u043b\u0438 \u0432\u0441\u0442\u0430\u0432\u044c\u0442\u0435 \u0442\u0435\u043a\u0441\u0442 \u0434\u043e\u0433\u043e\u0432\u043e\u0440\u0430 \u0434\u043b\u044f \u043f\u0440\u043e\u0432\u0435\u0440\u043a\u0438 \u0440\u0438\u0441\u043a\u043e\u0432'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Tabs value={inputMode} onValueChange={(v) => setInputMode(v as 'file' | 'text')}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="file" className="flex items-center gap-2">
                    <Upload className="h-4 w-4" />
                    {'\u0424\u0430\u0439\u043b'}
                  </TabsTrigger>
                  <TabsTrigger value="text" className="flex items-center gap-2">
                    <Type className="h-4 w-4" />
                    {'\u0422\u0435\u043a\u0441\u0442'}
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="file" className="mt-4">
                  <div
                    {...getRootProps()}
                    className={cn(
                      "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors",
                      isDragActive ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50",
                      file && "border-green-500 bg-green-500/5"
                    )}
                  >
                    <input {...getInputProps()} />
                    {file ? (
                      <div className="space-y-2">
                        <FileText className="h-12 w-12 mx-auto text-green-500" />
                        <p className="font-medium">{file.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {(file.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <Upload className="h-12 w-12 mx-auto text-muted-foreground" />
                        <p className="font-medium">
                          {isDragActive ? '\u041e\u0442\u043f\u0443\u0441\u0442\u0438\u0442\u0435 \u0444\u0430\u0439\u043b \u0437\u0434\u0435\u0441\u044c' : '\u041f\u0435\u0440\u0435\u0442\u0430\u0449\u0438\u0442\u0435 \u0444\u0430\u0439\u043b \u0441\u044e\u0434\u0430'}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {'\u0438\u043b\u0438 \u043d\u0430\u0436\u043c\u0438\u0442\u0435 \u0434\u043b\u044f \u0432\u044b\u0431\u043e\u0440\u0430 (PDF, DOCX, TXT \u0434\u043e 10MB)'}
                        </p>
                      </div>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="text" className="mt-4">
                  <Textarea
                    value={contractText}
                    onChange={(e) => setContractText(e.target.value)}
                    placeholder={'\u0412\u0441\u0442\u0430\u0432\u044c\u0442\u0435 \u0442\u0435\u043a\u0441\u0442 \u0434\u043e\u0433\u043e\u0432\u043e\u0440\u0430 \u0437\u0434\u0435\u0441\u044c...'}
                    className="min-h-[250px] font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground mt-2">
                    {contractText.trim().length < 100
                      ? `${'\u041c\u0438\u043d\u0438\u043c\u0443\u043c 100 \u0441\u0438\u043c\u0432\u043e\u043b\u043e\u0432'} (${contractText.trim().length}/100)`
                      : `${contractText.trim().length.toLocaleString()} ${'\u0441\u0438\u043c\u0432\u043e\u043b\u043e\u0432'}`}
                  </p>
                </TabsContent>
              </Tabs>

              <Button
                onClick={handleAnalyze}
                disabled={!canAnalyze}
                className="w-full"
              >
                {isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {'\u0410\u043d\u0430\u043b\u0438\u0437\u0438\u0440\u0443\u0435\u043c \u0434\u043e\u0433\u043e\u0432\u043e\u0440...'}
                  </>
                ) : (
                  '\u041f\u0440\u043e\u0430\u043d\u0430\u043b\u0438\u0437\u0438\u0440\u043e\u0432\u0430\u0442\u044c'
                )}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Analysis Result */}
        {analysis && (
          <div className="space-y-6">
            {/* Header with overall risk */}
            <Card className={cn(
              "border-2",
              analysis.overall_risk_level === 'critical' && "border-red-500",
              analysis.overall_risk_level === 'high' && "border-orange-500",
              analysis.overall_risk_level === 'medium' && "border-yellow-500",
              analysis.overall_risk_level === 'low' && "border-green-500",
            )}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>{'\u0420\u0435\u0437\u0443\u043b\u044c\u0442\u0430\u0442 \u0430\u043d\u0430\u043b\u0438\u0437\u0430'}</CardTitle>
                    <CardDescription>
                      {file?.name || `${'\u0422\u0435\u043a\u0441\u0442'} (${contractText.trim().length.toLocaleString()} ${'\u0441\u0438\u043c\u0432.'})`}
                    </CardDescription>
                  </div>
                  <Badge className={cn(
                    "text-lg px-4 py-2",
                    riskColors[analysis.overall_risk_level].bg,
                    riskColors[analysis.overall_risk_level].text
                  )}>
                    {riskLabels[analysis.overall_risk_level]} {'\u0440\u0438\u0441\u043a'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                {/* Risk stats */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-6">
                  {(['critical', 'high', 'medium', 'low'] as RiskLevel[]).map((level) => {
                    const RiskIcon = riskColors[level].icon
                    return (
                      <div key={level} className={cn("p-3 rounded-lg text-center", riskColors[level].bg)}>
                        <RiskIcon className={cn("h-5 w-5 mx-auto mb-1", riskColors[level].text)} />
                        <p className={cn("text-2xl font-bold", riskColors[level].text)}>
                          {riskStats[level]}
                        </p>
                        <p className="text-xs text-muted-foreground">{riskLabels[level]}</p>
                      </div>
                    )
                  })}
                </div>

                {/* Summary */}
                <div className="p-4 bg-muted rounded-lg">
                  <p className="font-medium mb-2">{'\u041a\u0440\u0430\u0442\u043a\u043e\u0435 \u043e\u043f\u0438\u0441\u0430\u043d\u0438\u0435'}</p>
                  <p className="text-sm">{analysis.summary}</p>
                </div>

                <Button
                  variant="outline"
                  className="w-full mt-4"
                  onClick={handleReset}
                >
                  {'\u041f\u0440\u043e\u0430\u043d\u0430\u043b\u0438\u0437\u0438\u0440\u043e\u0432\u0430\u0442\u044c \u0434\u0440\u0443\u0433\u043e\u0439 \u0434\u043e\u0433\u043e\u0432\u043e\u0440'}
                </Button>
              </CardContent>
            </Card>

            {/* Key conditions */}
            {analysis.key_conditions.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>{'\u041a\u043b\u044e\u0447\u0435\u0432\u044b\u0435 \u0443\u0441\u043b\u043e\u0432\u0438\u044f'}</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {analysis.key_conditions.map((condition, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <CheckCircle className="h-4 w-4 mt-0.5 text-green-500 shrink-0" />
                        <span className="text-sm">{condition}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {/* Risks */}
            {analysis.risks.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>{'\u0412\u044b\u044f\u0432\u043b\u0435\u043d\u043d\u044b\u0435 \u0440\u0438\u0441\u043a\u0438'}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {analysis.risks.map((risk, idx) => {
                      const RiskIcon = riskColors[risk.level].icon
                      return (
                        <div
                          key={idx}
                          className={cn(
                            "p-3 sm:p-4 rounded-lg border-l-4 overflow-hidden",
                            riskColors[risk.level].bg,
                            risk.level === 'critical' && "border-l-red-500",
                            risk.level === 'high' && "border-l-orange-500",
                            risk.level === 'medium' && "border-l-yellow-500",
                            risk.level === 'low' && "border-l-green-500",
                          )}
                        >
                          <div className="flex items-center gap-2 mb-2">
                            <RiskIcon className={cn("h-5 w-5 shrink-0", riskColors[risk.level].text)} />
                            <p className="font-medium text-sm sm:text-base break-words min-w-0">{risk.title}</p>
                            <Badge variant="outline" className="text-xs shrink-0">
                              {riskLabels[risk.level]}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground break-words">{risk.description}</p>
                          {risk.clause && (
                            <div className="mt-2 p-2 bg-background/50 rounded text-xs font-mono break-words overflow-x-auto">
                              &quot;{risk.clause}&quot;
                            </div>
                          )}
                          <div className="flex items-start gap-2 mt-2 pt-2 border-t">
                            <Info className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
                            <p className="text-sm text-blue-600 break-words min-w-0">{risk.recommendation}</p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* General recommendations */}
            {analysis.recommendations.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>{'\u0420\u0435\u043a\u043e\u043c\u0435\u043d\u0434\u0430\u0446\u0438\u0438'}</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {analysis.recommendations.map((rec, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <Info className="h-4 w-4 mt-0.5 text-blue-500 shrink-0" />
                        <span className="text-sm">{rec}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
