pub fn evaluate_expression(expression: &str) -> Result<f64, String> {
    struct Parser<'a> {
        bytes: &'a [u8],
        pos: usize,
    }
    impl<'a> Parser<'a> {
        fn skip_ws(&mut self) {
            while self.pos < self.bytes.len() && self.bytes[self.pos].is_ascii_whitespace() {
                self.pos += 1;
            }
        }
        fn expression(&mut self) -> Result<f64, String> {
            let mut value = self.term()?;
            loop {
                self.skip_ws();
                match self.bytes.get(self.pos).copied() {
                    Some(b'+') => {
                        self.pos += 1;
                        value += self.term()?;
                    }
                    Some(b'-') => {
                        self.pos += 1;
                        value -= self.term()?;
                    }
                    _ => return Ok(value),
                }
            }
        }
        fn term(&mut self) -> Result<f64, String> {
            let mut value = self.factor()?;
            loop {
                self.skip_ws();
                match self.bytes.get(self.pos).copied() {
                    Some(b'*') => {
                        self.pos += 1;
                        value *= self.factor()?;
                    }
                    Some(b'/') => {
                        self.pos += 1;
                        let divisor = self.factor()?;
                        if divisor == 0.0 {
                            return Err("Tidak dapat membagi dengan nol.".into());
                        }
                        value /= divisor;
                    }
                    Some(b'%') => {
                        self.pos += 1;
                        let divisor = self.factor()?;
                        if divisor == 0.0 {
                            return Err("Tidak dapat modulo dengan nol.".into());
                        }
                        value %= divisor;
                    }
                    _ => return Ok(value),
                }
            }
        }
        fn factor(&mut self) -> Result<f64, String> {
            self.skip_ws();
            if self.bytes.get(self.pos) == Some(&b'-') {
                self.pos += 1;
                return Ok(-self.factor()?);
            }
            if self.bytes.get(self.pos) == Some(&b'(') {
                self.pos += 1;
                let value = self.expression()?;
                self.skip_ws();
                if self.bytes.get(self.pos) != Some(&b')') {
                    return Err("Kurung ekspresi tidak lengkap.".into());
                }
                self.pos += 1;
                return Ok(value);
            }
            let start = self.pos;
            while self.pos < self.bytes.len()
                && (self.bytes[self.pos].is_ascii_digit() || self.bytes[self.pos] == b'.')
            {
                self.pos += 1;
            }
            if start == self.pos {
                return Err("Ekspresi kalkulator tidak valid.".into());
            }
            std::str::from_utf8(&self.bytes[start..self.pos])
                .ok()
                .and_then(|s| s.parse::<f64>().ok())
                .ok_or_else(|| "Angka dalam ekspresi tidak valid.".into())
        }
    }
    if expression.len() > 200 {
        return Err("Ekspresi terlalu panjang.".into());
    }
    let mut parser = Parser {
        bytes: expression.as_bytes(),
        pos: 0,
    };
    let value = parser.expression()?;
    parser.skip_ws();
    if parser.pos != parser.bytes.len() || !value.is_finite() {
        return Err("Ekspresi kalkulator tidak valid.".into());
    }
    Ok(value)
}

