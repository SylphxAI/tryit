use super::random::JsLcg;

pub(super) const GRID_WIDTH: i32 = 4;
pub(super) const GRID_HEIGHT: i32 = 5;
pub(super) const EXIT_X: i32 = 1;
pub(super) const EXIT_Y: i32 = 3;

#[derive(Clone, Copy)]
struct Template {
    width: i32,
    height: i32,
}

const TEMPLATES: [Template; 5] = [
    Template {
        width: 1,
        height: 2,
    },
    Template {
        width: 1,
        height: 2,
    },
    Template {
        width: 2,
        height: 1,
    },
    Template {
        width: 2,
        height: 1,
    },
    Template {
        width: 1,
        height: 1,
    },
];

#[derive(Clone, Debug)]
pub(super) struct Block {
    pub(super) id: String,
    pub(super) x: i32,
    pub(super) y: i32,
    pub(super) width: i32,
    pub(super) height: i32,
    pub(super) is_target: bool,
}

fn try_place(occupied: &mut [[bool; 4]; 5], t: Template, x: i32, y: i32) -> bool {
    if x + t.width > GRID_WIDTH || y + t.height > GRID_HEIGHT {
        return false;
    }
    for yy in y..y + t.height {
        for xx in x..x + t.width {
            if occupied[yy as usize][xx as usize] {
                return false;
            }
        }
    }
    for yy in y..y + t.height {
        for xx in x..x + t.width {
            occupied[yy as usize][xx as usize] = true;
        }
    }
    true
}

fn block_id(n: u32) -> String {
    char::from_u32(97 + n).map(String::from).unwrap_or_default()
}

pub(super) fn generate_configuration(random: &mut JsLcg) -> Option<Vec<Block>> {
    let mut occupied = [[false; 4]; 5];
    let targets = [(0, 0), (1, 0), (2, 0), (0, 1), (1, 1), (2, 1)];
    let (tx, ty) = targets[(random.next_f64() * targets.len() as f64).floor() as usize];
    for y in ty..ty + 2 {
        for x in tx..tx + 2 {
            occupied[y as usize][x as usize] = true;
        }
    }
    let mut blocks = vec![Block {
        id: "target".to_string(),
        x: tx,
        y: ty,
        width: 2,
        height: 2,
        is_target: true,
    }];
    let num_blocks = 5 + (random.next_f64() * 4.0).floor() as usize;
    let mut next_id = 0u32;
    for _ in 0..num_blocks {
        let template = TEMPLATES[(random.next_f64() * TEMPLATES.len() as f64).floor() as usize];
        let mut placed = false;
        for _ in 0..20 {
            let x = (random.next_f64() * f64::from(GRID_WIDTH)).floor() as i32;
            let y = (random.next_f64() * f64::from(GRID_HEIGHT)).floor() as i32;
            if try_place(&mut occupied, template, x, y) {
                blocks.push(Block {
                    id: block_id(next_id),
                    x,
                    y,
                    width: template.width,
                    height: template.height,
                    is_target: false,
                });
                next_id += 1;
                placed = true;
                break;
            }
        }
        if !placed && (template.width > 1 || template.height > 1) {
            let small = Template {
                width: 1,
                height: 1,
            };
            for _ in 0..20 {
                let x = (random.next_f64() * f64::from(GRID_WIDTH)).floor() as i32;
                let y = (random.next_f64() * f64::from(GRID_HEIGHT)).floor() as i32;
                if try_place(&mut occupied, small, x, y) {
                    blocks.push(Block {
                        id: block_id(next_id),
                        x,
                        y,
                        width: 1,
                        height: 1,
                        is_target: false,
                    });
                    next_id += 1;
                    break;
                }
            }
        }
    }
    if blocks.len() < 5 {
        return None;
    }
    let empty = occupied.iter().flatten().filter(|c| !**c).count();
    if empty < 2 {
        return None;
    }
    Some(blocks)
}

fn overlap(a: (i32, i32, i32, i32), b: (i32, i32, i32, i32)) -> bool {
    !(a.0 + a.2 <= b.0 || b.0 + b.2 <= a.0 || a.1 + a.3 <= b.1 || b.1 + b.3 <= a.1)
}

pub(super) fn is_valid_configuration(blocks: &[Block]) -> bool {
    if !blocks.iter().any(|b| b.is_target) {
        return false;
    }
    for b in blocks {
        if b.x < 0 || b.y < 0 || b.x + b.width > GRID_WIDTH || b.y + b.height > GRID_HEIGHT {
            return false;
        }
    }
    for i in 0..blocks.len() {
        for j in i + 1..blocks.len() {
            let a = &blocks[i];
            let b = &blocks[j];
            if overlap((a.x, a.y, a.width, a.height), (b.x, b.y, b.width, b.height)) {
                return false;
            }
        }
    }
    true
}
