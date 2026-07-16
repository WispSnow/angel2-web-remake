// Reports instructions containing any selected scalar value.
// @category Angel2

import java.util.HashSet;
import java.util.Set;

import ghidra.app.script.GhidraScript;
import ghidra.program.model.lang.Register;
import ghidra.program.model.listing.Function;
import ghidra.program.model.listing.Instruction;
import ghidra.program.model.listing.InstructionIterator;
import ghidra.program.model.scalar.Scalar;

public class ReportScalarOperands extends GhidraScript {
    @Override
    protected void run() throws Exception {
        String[] args = getScriptArgs();
        if (args.length == 0) {
            throw new IllegalArgumentException("Expected one or more hexadecimal scalar values");
        }
        Set<Long> targets = new HashSet<>();
        for (String arg : args) {
            targets.add(Long.parseLong(arg.replaceFirst("^0[xX]", ""), 16));
        }
        int matches = 0;
        InstructionIterator instructions = currentProgram.getListing().getInstructions(true);
        while (instructions.hasNext()) {
            Instruction instruction = instructions.next();
            boolean matched = false;
            for (int operand = 0; operand < instruction.getNumOperands(); operand++) {
                for (Object object : instruction.getOpObjects(operand)) {
                    if (object instanceof Scalar &&
                        targets.contains(((Scalar) object).getUnsignedValue())) {
                        matched = true;
                    }
                }
            }
            if (!matched) {
                continue;
            }
            Function function = getFunctionContaining(instruction.getAddress());
            println("at=" + instruction.getAddress() +
                " function=" + (function == null ? "<none>" : function.getName()) +
                " instruction=" + instruction);
            matches++;
        }
        println("matches=" + matches);
    }
}
