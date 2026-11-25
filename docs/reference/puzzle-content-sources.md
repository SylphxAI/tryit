# Cipher and five-letter puzzle sources

## Cipher

Every excerpt in the [quote bank](../../crates/puzzled-core/src/capabilities/puzzle_play/generate/data/cryptogram_quotes.tsv)
has an author, work or translation, publication year and Project Gutenberg
edition ID. The ID forms the URL https://www.gutenberg.org/ebooks/{id}. The
excerpts were checked against those transcriptions (including their GITenberg
mirrors). Excerpt boundaries use sentence punctuation and initial capitals;
curly apostrophes are folded to ASCII for the cipher. Descartes uses John
Veitch's historical English translation, not a recent translation.

Do not use a quotation site or a work's original-language publication date as
proof for a translation. Verify the actual English wording in a pre-1929
edition before adding a quote. Keep an exact edition reference in the bank.
Stored puzzle rows are not rewritten by new quote generation.

## Five and Quad

Both guess banks are sorted, deduplicated five-letter ASCII subsets of the
in-repo CC0 Frame dictionary (word_box_words.txt). Five's common solutions use
the repository’s independently maintained Quad targets and Mini Grid rows/columns,
keeping only canonical five-letter words in Frame, deduplicating and sorting.
The Five solutions are server-only. Quad's pick algorithm and target order are
unchanged.
